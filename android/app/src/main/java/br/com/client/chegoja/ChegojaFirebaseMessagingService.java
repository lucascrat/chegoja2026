package br.com.client.chegoja;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class ChegojaFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "ChegojaFCM";
    private static final String CHANNEL_RIDES = "chegoja_rides";
    private static final String CHANNEL_ALERT = "special_alert";

    private static MediaPlayer sAlertPlayer;
    private static boolean sAlertActive = false;

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Log.d(TAG, "FCM recebida de: " + remoteMessage.getFrom());

        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        String title = data.get("title");
        String body = data.get("body");

        if (title == null) title = "ChegoJá";
        if (body == null) body = "Nova notificação";

        Log.d(TAG, "Type=" + type + " Title=" + title);

        if ("new_ride".equals(type)) {
            // Notificacao full-screen estilo chamada (acorda a tela)
            showRideAlert(title, body);
        } else {
            showNotification(title, body, type, data);
        }
    }

    private void showRideAlert(String title, String body) {
        sAlertActive = true;
        createChannels();

        // 1. Notificacao full-screen CATEGORY_CALL
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openIntent.putExtra("from_fcm", true);

        PendingIntent fullScreenPI = PendingIntent.getActivity(
                this, 777, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ALERT)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setAutoCancel(false)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setFullScreenIntent(fullScreenPI, true)
                .setVibrate(new long[]{0, 1000, 300, 1000, 300, 1000})
                .build();

        try {
            NotificationManagerCompat.from(this).notify(9999, notification);
        } catch (SecurityException e) {
            Log.w(TAG, "Sem permissao de notificacao", e);
        }

        // 2. Vibracao em loop
        Vibrator vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator != null && vibrator.hasVibrator()) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(
                        new long[]{0, 1000, 300, 1000, 300, 1000}, 0));
            } else {
                vibrator.vibrate(new long[]{0, 1000, 300, 1000, 300, 1000}, 0);
            }
        }

        // 3. Som (loop)
        playAlertSound();
    }

    private void playAlertSound() {
        try {
            if (sAlertPlayer != null) {
                sAlertPlayer.release();
                sAlertPlayer = null;
            }
            sAlertPlayer = new MediaPlayer();
            try {
                AssetFileDescriptor afd = getAssets().openFd("public/ubb.mp3");
                sAlertPlayer.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                afd.close();
            } catch (Exception e) {
                Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                sAlertPlayer.setDataSource(this, ringtone);
            }
            sAlertPlayer.setLooping(true);
            sAlertPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            sAlertPlayer.prepare();
            sAlertPlayer.start();
        } catch (Exception e) {
            Log.e(TAG, "playAlertSound falhou", e);
            sAlertPlayer = null;
        }
    }

    public static void stopAlert(Context context) {
        sAlertActive = false;
        if (sAlertPlayer != null) {
            try { sAlertPlayer.stop(); } catch (Exception e) { }
            sAlertPlayer.release();
            sAlertPlayer = null;
        }
        try {
            NotificationManagerCompat.from(context).cancel(9999);
        } catch (Exception e) { }
        Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator != null) {
            try { vibrator.cancel(); } catch (Exception e) { }
        }
    }

    public static boolean isAlertActive() {
        return sAlertActive;
    }

    private void showNotification(String title, String body, String type, Map<String, String> data) {
        String channelId = "ubb".equals(data.get("sound")) ? CHANNEL_ALERT : CHANNEL_RIDES;

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, type != null ? type.hashCode() : 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .build();

        try {
            NotificationManagerCompat.from(this).notify(
                    type != null ? type.hashCode() : 8888, notification);
        } catch (SecurityException e) {
            Log.w(TAG, "Sem permissao de notificacao", e);
        }
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;
            if (nm.getNotificationChannel(CHANNEL_ALERT) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ALERT, "Alertas Especiais",
                        NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Alertas de corrida com prioridade maxima");
                ch.enableVibration(true);
                ch.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
                nm.createNotificationChannel(ch);
            }
            if (nm.getNotificationChannel(CHANNEL_RIDES) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_RIDES, "Corridas e Alertas",
                        NotificationManager.IMPORTANCE_HIGH);
                nm.createNotificationChannel(ch);
            }
        }
    }

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "Novo token FCM: " + token);
    }
}
