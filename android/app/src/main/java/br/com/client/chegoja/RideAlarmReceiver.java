package br.com.client.chegoja;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

public class RideAlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "RideAlarm";
    private static final String PREFS_NAME = "chegoja_ride_prefs";
    private static final String KEY_USER_ID = "driver_user_id";
    private static final String KEY_LAST_RIDE = "last_ride_id";
    private static final long ALARM_INTERVAL_MS = 60_000;
    private static final String SUPABASE_URL = "https://supabase.appbr.pro";
    private static final String ANON_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4Mjc4NTI4MCwiZXhwIjo0OTM4NDU4ODgwLCJyb2xlIjoiYW5vbiJ9.QpgPlSCfXBV2bdbHRqG21p0baLbzt9UVvh205d5N_WU";

    private static OkHttpClient httpClient;

    @Override
    public void onReceive(Context context, Intent intent) {
        Log.d(TAG, "Alarm disparado");

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String userId = prefs.getString(KEY_USER_ID, null);
        String lastRideId = prefs.getString(KEY_LAST_RIDE, "");

        if (userId == null) {
            Log.d(TAG, "Sem userId configurado, ignorando");
            scheduleNext(context);
            return;
        }

        if (httpClient == null) {
            httpClient = new OkHttpClient.Builder()
                    .connectTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(5, java.util.concurrent.TimeUnit.SECONDS)
                    .build();
        }

        // Poll para corridas searching
        pollAndAlert(context, userId, lastRideId, prefs);

        // Reagendar
        scheduleNext(context);
    }

    private void pollAndAlert(Context context, String userId, String lastRideId, SharedPreferences prefs) {
        String url = SUPABASE_URL + "/rest/v1/rides?select=id,status,origin_lat,origin_lng,client_id&status=eq.searching&order=created_at.desc&limit=3";
        Request request = new Request.Builder()
                .url(url)
                .addHeader("apikey", ANON_KEY)
                .addHeader("Authorization", "Bearer " + ANON_KEY)
                .addHeader("Accept", "application/json")
                .build();

        try {
            Response response = httpClient.newCall(request).execute();
            if (response.isSuccessful()) {
                String body = response.body() != null ? response.body().string() : "[]";
                JSONArray rides = new JSONArray(body);
                for (int i = 0; i < rides.length(); i++) {
                    JSONObject ride = rides.getJSONObject(i);
                    String rideId = ride.optString("id", "");
                    String status = ride.optString("status", "");

                    if (!rideId.isEmpty() && "searching".equals(status) && !rideId.equals(lastRideId)) {
                        Log.d(TAG, "Nova corrida detectada pelo alarme: " + rideId);
                        prefs.edit().putString(KEY_LAST_RIDE, rideId).apply();

                        // Acordar a tela
                        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                        if (pm != null) {
                            PowerManager.WakeLock wl = pm.newWakeLock(
                                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                                            | PowerManager.ACQUIRE_CAUSES_WAKEUP
                                            | PowerManager.ON_AFTER_RELEASE,
                                    "chegoja:ride_alarm");
                            wl.acquire(5000);
                            wl.release();
                        }

                        // Iniciar RideAlertService (som + notificacao full-screen)
                        Intent alertIntent = new Intent(context, RideAlertService.class);
                        alertIntent.putExtra("title", "CHEGOJA - NOVA CORRIDA");
                        alertIntent.putExtra("body", "Toque para ATENDER AGORA!");
                        alertIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            context.startForegroundService(alertIntent);
                        } else {
                            context.startService(alertIntent);
                        }

                        break;
                    }
                }
            }
            response.close();
        } catch (Exception e) {
            Log.e(TAG, "poll error", e);
        }
    }

    public static void schedule(Context context, String userId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_USER_ID, userId).apply();

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent intent = new Intent(context, RideAlarmReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        long triggerAt = System.currentTimeMillis() + 10_000;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        } else {
            am.setRepeating(AlarmManager.RTC_WAKEUP, triggerAt, ALARM_INTERVAL_MS, pi);
        }

        Log.d(TAG, "Alarme agendado para " + userId);
    }

    public static void cancel(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().remove(KEY_USER_ID).apply();

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent intent = new Intent(context, RideAlarmReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);

        Log.d(TAG, "Alarme cancelado");
    }

    private void scheduleNext(Context context) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent intent = new Intent(context, RideAlarmReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        long nextTrigger = System.currentTimeMillis() + ALARM_INTERVAL_MS;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextTrigger, pi);
        } else {
            am.set(AlarmManager.RTC_WAKEUP, nextTrigger, pi);
        }
    }
}
