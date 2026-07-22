package br.com.client.chegoja;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;
import android.webkit.WebView;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

public class RealtimeRideService extends Service {

    private static final String TAG = "RealtimeRide";
    private static final String CHANNEL_ID = "realtime_ride";
    private static final int NOTIF_ID = 6666;
    private static final long POLL_INTERVAL_MS = 8_000;
    private static final String SUPABASE_URL = "https://supabase.appbr.pro";
    private static final String ANON_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4Mjc4NTI4MCwiZXhwIjo0OTM4NDU4ODgwLCJyb2xlIjoiYW5vbiJ9.QpgPlSCfXBV2bdbHRqG21p0baLbzt9UVvh205d5N_WU";

    private static RealtimeRideService instance;

    private OkHttpClient httpClient;
    private String userId;
    private String lastRideId = "";
    private boolean shouldPoll = true;

    private final Handler pollHandler = new Handler(Looper.getMainLooper());
    private Runnable pollRunnable;
    private long lastPollAt = 0;

    public static boolean isRunning() {
        return instance != null;
    }

    public static void start(Context context, String uid) {
        Intent intent = new Intent(context, RealtimeRideService.class);
        intent.putExtra("userId", uid);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        if (instance != null) instance.shouldPoll = false;
        context.stopService(new Intent(context, RealtimeRideService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();

        httpClient = new OkHttpClient.Builder()
                .connectTimeout(5, TimeUnit.SECONDS)
                .readTimeout(5, TimeUnit.SECONDS)
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.hasExtra("userId")) {
            userId = intent.getStringExtra("userId");
        }

        if (userId == null) {
            Log.e(TAG, "userId nao fornecido");
            stopSelf();
            return START_NOT_STICKY;
        }

        startForegroundNotification();
        shouldPoll = true;
        startPolling();

        return START_STICKY;
    }

    private void startForegroundNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_directions)
                .setContentTitle("ChegoJá Motorista")
                .setContentText("Online — monitorando corridas")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIF_ID, notif,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIF_ID, notif);
        }
    }

    // ---- HTTP POLLING ----

    private void startPolling() {
        stopPolling();
        pollRunnable = new Runnable() {
            @Override
            public void run() {
                if (!shouldPoll) return;
                pollForRides();
                pollHandler.postDelayed(this, POLL_INTERVAL_MS);
            }
        };
        pollHandler.post(pollRunnable);
    }

    private void stopPolling() {
        if (pollRunnable != null) {
            pollHandler.removeCallbacks(pollRunnable);
            pollRunnable = null;
        }
    }

    private void pollForRides() {
        long now = System.currentTimeMillis();
        if (now - lastPollAt < 2000) return; // evitar duplicatas
        lastPollAt = now;

        // Poll 1: corridas novas (status=searching)
        pollUrl("/rest/v1/rides?select=id,status,origin_lat,origin_lng,client_id&status=eq.searching&order=created_at.desc&limit=3", true);

        // Poll 2: corridas atribuidas a este motorista
        pollUrl("/rest/v1/rides?select=id,status,origin_lat,origin_lng,client_id&driver_id=eq." + userId + "&order=updated_at.desc&limit=3", false);
    }

    private void pollUrl(final String path, final boolean checkNew) {
        final String url = SUPABASE_URL + path;
        Request request = new Request.Builder()
                .url(url)
                .addHeader("apikey", ANON_KEY)
                .addHeader("Authorization", "Bearer " + ANON_KEY)
                .addHeader("Accept", "application/json")
                .build();

        httpClient.newCall(request).enqueue(new okhttp3.Callback() {
            @Override
            public void onFailure(okhttp3.Call call, IOException e) {
                Log.d(TAG, "Poll falhou: " + e.getMessage());
            }

            @Override
            public void onResponse(okhttp3.Call call, Response response) throws IOException {
                try {
                    if (!response.isSuccessful()) return;
                    String body = response.body() != null ? response.body().string() : "[]";
                    JSONArray rides = new JSONArray(body);
                    for (int i = 0; i < rides.length(); i++) {
                        JSONObject ride = rides.getJSONObject(i);
                        String rideId = ride.optString("id", "");
                        String rideStatus = ride.optString("status", "");
                        if (rideId.isEmpty()) continue;

                        boolean isNewSearching = checkNew
                                && "searching".equals(rideStatus)
                                && !rideId.equals(lastRideId);
                        boolean isAssigned = !checkNew
                                && (ride.optString("driver_id", "").equals(userId));

                        if (isNewSearching || isAssigned) {
                            lastRideId = rideId;
                            Log.d(TAG, "Corrida encontrada via poll: " + rideId);
                            triggerRideAlert(ride);
                            notifyWebView(ride);
                        }
                    }
                } catch (Exception e) {
                    Log.e(TAG, "poll parse error", e);
                } finally {
                    if (response.body() != null) response.body().close();
                }
            }
        });
    }

    // ---- ALERTA ----

    private void triggerRideAlert(JSONObject ride) {
        // Wake lock
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wl = null;
        if (pm != null) {
            try {
                wl = pm.newWakeLock(
                        PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                                | PowerManager.ACQUIRE_CAUSES_WAKEUP
                                | PowerManager.ON_AFTER_RELEASE,
                        "chegoja:ride_poll");
                wl.acquire(10_000);
            } catch (Exception e) { }
        }

        // RideAlertService (som + vibracao + notificacao full-screen)
        Intent alertIntent = new Intent(this, RideAlertService.class);
        alertIntent.putExtra("title", "CHEGOJA - NOVA CORRIDA");
        alertIntent.putExtra("body", "Toque para ATENDER AGORA!");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(alertIntent);
        } else {
            startService(alertIntent);
        }

        if (wl != null && wl.isHeld()) {
            try { wl.release(); } catch (Exception e) { }
        }
    }

    private void notifyWebView(JSONObject ride) {
        MainActivity activity = MainActivity.getInstance();
        if (activity == null) return;
        WebView wv = activity.getMainWebView();
        if (wv == null) return;

        final String json = ride.toString().replace("'", "\\'");
        activity.runOnUiThread(() -> {
            try {
                wv.evaluateJavascript(
                        "window.handleNativeRide && window.handleNativeRide(" + json + ");",
                        null);
            } catch (Exception e) {
                Log.e(TAG, "evaluateJavascript error", e);
            }
        });
    }

    // ---- Lifecycle ----

    @Override
    public void onDestroy() {
        shouldPoll = false;
        stopPolling();
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Monitoramento de Corridas",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Monitora novas corridas via polling");
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }
}
