package br.com.client.chegoja;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PictureInPictureParams;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Rational;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.lang.ref.WeakReference;

public class MainActivity extends BridgeActivity {

    private static WeakReference<MainActivity> sInstance;
    private NativeBridge nativeBridge;
    private boolean isPipRequested = false;

    public static MainActivity getInstance() {
        return sInstance != null ? sInstance.get() : null;
    }

    public WebView getMainWebView() {
        return bridge != null ? bridge.getWebView() : null;
    }

    @Override
    public void onPostCreate(Bundle savedInstanceState) {
        super.onPostCreate(savedInstanceState);
        sInstance = new WeakReference<>(this);
        WebView webView = this.bridge != null ? this.bridge.getWebView() : null;
        if (webView != null) {
            nativeBridge = new NativeBridge(this);
            webView.addJavascriptInterface(nativeBridge, "Android");
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        isPipRequested = false;
        DriverBackgroundService.hideBubble(this);
        ChegojaFirebaseMessagingService.stopAlert(this);
        if (nativeBridge != null) nativeBridge.continuePermissionFlow();
        handleFCMIntent(getIntent());
    }

    @Override
    public void onPause() {
        boolean enteringPip = isPipRequested
                || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && isInPictureInPictureMode());
        super.onPause();
        // Em PiP, o super.onPause() pausa o WebView (BridgeActivity).
        // Precisamos reativar para o WebSocket Realtime continuar.
        if (enteringPip) {
            WebView wv = this.bridge != null ? this.bridge.getWebView() : null;
            if (wv != null) {
                wv.onResume();
                wv.resumeTimers();
            }
        }
        // Soh mostra bolha se NAO estiver em PiP
        if (DriverBackgroundService.isRunning() && !enteringPip) {
            DriverBackgroundService.showBubble(this);
        }
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        // Usuario pressionou Home/Recents — mantido para debug
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, android.content.res.Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        if (isInPictureInPictureMode) {
            // Entrou em PiP — esconde bolha (o PiP ja e a "bolha")
            DriverBackgroundService.hideBubble(this);
        } else {
            // Saiu do PiP — volta ao normal
            DriverBackgroundService.hideBubble(this);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent != null && intent.getBooleanExtra("enter_pip", false)) {
            enterPipModeInternal();
        }
        handleFCMIntent(intent);
    }

    private void handleFCMIntent(Intent intent) {
        if (intent == null || intent.getExtras() == null) return;
        try {
            Bundle extras = intent.getExtras();
            String type = extras.getString("type");
            if ("new_ride".equals(type)) {
                String title = extras.getString("title", "CHEGOJA - NOVA CORRIDA");
                String body = extras.getString("body", "Toque para ATENDER AGORA!");
                Intent alertIntent = new Intent(this, RideAlertService.class);
                alertIntent.putExtra("title", title);
                alertIntent.putExtra("body", body);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(alertIntent);
                } else {
                    startService(alertIntent);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onDestroy() {
        RideAlertService.stop(this);
        ChegojaFirebaseMessagingService.stopAlert(this);
        if (sInstance != null && sInstance.get() == this) sInstance = null;
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (nativeBridge != null) nativeBridge.continuePermissionFlow();
    }

    public static void exitPipAndBringToFront(Context context) {
        MainActivity activity = sInstance != null ? sInstance.get() : null;
        if (activity != null) {
            activity.runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && activity.isInPictureInPictureMode()) {
                        ActivityManager am = (ActivityManager) activity.getSystemService(Context.ACTIVITY_SERVICE);
                        if (am != null) {
                            am.moveTaskToFront(activity.getTaskId(), ActivityManager.MOVE_TASK_WITH_HOME);
                        }
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        } else {
            try {
                Intent intent = new Intent(context, MainActivity.class);
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY);
                context.startActivity(intent);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }

    private void enterPipModeInternal() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                if (!isInPictureInPictureMode()) {
                    isPipRequested = true;
                    PictureInPictureParams params =
                            new PictureInPictureParams.Builder()
                                    .setAspectRatio(new Rational(9, 16))
                                    .setAutoEnterEnabled(true)
                                    .build();
                    enterPictureInPictureMode(params);
                }
            } catch (Exception e) {
                isPipRequested = false;
                e.printStackTrace();
            }
        }
    }

    public class NativeBridge {

        private final Activity activity;
        private final Context context;
        private MediaPlayer messagePlayer;

        public NativeBridge(Activity activity) {
            this.activity = activity;
            this.context = activity.getApplicationContext();
        }

        // ---- ALERTA DE CORRIDA ----

        @JavascriptInterface
        public void triggerNativeAlert() {
            ChegojaFirebaseMessagingService.stopAlert(context);
            Intent intent = new Intent(context, RideAlertService.class);
            intent.putExtra("title", "CHEGOJA - NOVA CORRIDA");
            intent.putExtra("body", "Toque para ATENDER AGORA!");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        }

        @JavascriptInterface
        public void triggerNativeMessageSound() {
            activity.runOnUiThread(() -> {
                try {
                    if (messagePlayer != null) messagePlayer.release();
                    messagePlayer = new MediaPlayer();
                    try {
                        AssetFileDescriptor afd = context.getAssets().openFd("public/ubb.mp3");
                        messagePlayer.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                        afd.close();
                    } catch (Exception e) {
                        Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                        messagePlayer.setDataSource(context, ringtone);
                    }
                    messagePlayer.setLooping(false);
                    messagePlayer.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build());
                    messagePlayer.prepare();
                    messagePlayer.start();
                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void stopNativeAlert() {
            ChegojaFirebaseMessagingService.stopAlert(context);
            RideAlertService.stop(context);
        }

        // ---- BACKGROUND SERVICE (KEEP-ALIVE + BOLHA) ----

        @JavascriptInterface
        public void startBackgroundService() {
            DriverBackgroundService.start(context);
        }

        @JavascriptInterface
        public void stopBackgroundService() {
            DriverBackgroundService.stop(context);
        }

        @JavascriptInterface
        public boolean isBackgroundServiceRunning() {
            return DriverBackgroundService.isRunning();
        }

        // ---- REALTIME RIDE SERVICE (WebSocket nativo) ----

        @JavascriptInterface
        public void startRealtimeRideService(String uid) {
            RealtimeRideService.start(context, uid);
            RideAlarmReceiver.schedule(context, uid);
        }

        @JavascriptInterface
        public void stopRealtimeRideService() {
            RealtimeRideService.stop(context);
            RideAlarmReceiver.cancel(context);
        }

        @JavascriptInterface
        public boolean isRealtimeRideServiceRunning() {
            return RealtimeRideService.isRunning();
        }

        // ---- PIP ----

        @JavascriptInterface
        public void enterPipMode() {
            activity.runOnUiThread(() -> enterPipModeInternal());
        }

        // ---- PERMISSOES (sequencial) ----

        private int permStep = 0;
        private boolean isRequestingPermissions = false;

        @JavascriptInterface
        public void requestAllPermissions() {
            activity.runOnUiThread(() -> {
                permStep = 0;
                isRequestingPermissions = true;
                requestNextPermission();
            });
        }

        @JavascriptInterface
        public void requestPermissions() {
            requestAllPermissions();
        }

        private void requestNextPermission() {
            if (!isRequestingPermissions) return;
            try {
                switch (permStep) {
                    case 0:
                        // Notificacoes (Android 13+)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                                && ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS)
                                != PackageManager.PERMISSION_GRANTED) {
                            permStep = 1;
                            showToast("Permissão 1/5: Notificações — toque em 'Permitir'");
                            ActivityCompat.requestPermissions(activity,
                                    new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1001);
                            return;
                        }
                        permStep = 1;

                    case 1:
                        // Localizacao precisa + aproximada
                        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION)
                                != PackageManager.PERMISSION_GRANTED) {
                            permStep = 2;
                            showToast("Permissão 2/5: Localização (GPS) — toque em 'Permitir'");
                            ActivityCompat.requestPermissions(activity,
                                    new String[]{
                                            android.Manifest.permission.ACCESS_FINE_LOCATION,
                                            android.Manifest.permission.ACCESS_COARSE_LOCATION
                                    }, 1002);
                            return;
                        }
                        permStep = 2;

                    case 2:
                        // Localizacao em segundo plano (Android 10+)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                                && ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                                != PackageManager.PERMISSION_GRANTED) {
                            permStep = 3;
                            showToast("Permissão 3/5: Localização em 2º plano — toque em 'Permitir o tempo todo'");
                            ActivityCompat.requestPermissions(activity,
                                    new String[]{android.Manifest.permission.ACCESS_BACKGROUND_LOCATION}, 1003);
                            return;
                        }
                        permStep = 3;

                    case 3:
                        // Sobreposicao (bolha flutuante, Android 6+)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                                && !Settings.canDrawOverlays(context)) {
                            permStep = 4;
                            showToast("Permissão 4/5: Sobreposição (bolha) — ative a chave");
                            Intent intent = new Intent(
                                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                    Uri.parse("package:" + context.getPackageName()));
                            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            context.startActivity(intent);
                            return;
                        }
                        permStep = 4;

                    case 4:
                        // Ignorar otimizacao de bateria
                        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                        String pkg = context.getPackageName();
                        if (pm != null && !pm.isIgnoringBatteryOptimizations(pkg)) {
                            isRequestingPermissions = false;
                            showToast("Permissão 5/5: Bateria — toque em 'Permitir' e volte ao app");
                            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                            intent.setData(Uri.parse("package:" + pkg));
                            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            context.startActivity(intent);
                            // isRequestingPermissions fica false porque nao ha callback confiavel
                            return;
                        }

                    default:
                        // Concluido
                        isRequestingPermissions = false;
                        showToast("Todas as permissões concedidas! ✓");
                        Toast.makeText(context,
                                "ATENÇÃO: Vá em Config > Apps > ChegoJá Motorista > " +
                                "Ative: 'Iniciar automaticamente', 'Sem restrições de bateria', " +
                                "'Mostrar pop-up em 2º plano' e 'Fixar em recentes'",
                                Toast.LENGTH_LONG).show();
                        return;
                }
            } catch (Exception e) {
                e.printStackTrace();
                isRequestingPermissions = false;
                permStep = 0;
            }
        }

        public void continuePermissionFlow() {
            if (isRequestingPermissions) {
                activity.runOnUiThread(this::requestNextPermission);
            }
        }

        // ---- UTILITARIOS ----

        @JavascriptInterface
        public void showToast(final String msg) {
            activity.runOnUiThread(() ->
                    Toast.makeText(context, msg, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void bringToFront() {
            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            context.startActivity(intent);
        }
    }
}
