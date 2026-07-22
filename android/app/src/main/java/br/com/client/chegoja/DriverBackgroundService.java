package br.com.client.chegoja;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;

import androidx.core.app.NotificationCompat;

public class DriverBackgroundService extends Service {

    private static final String CHANNEL_ID = "driver_online";
    private static final int NOTIF_ID = 8888;

    private static DriverBackgroundService instance;

    private PowerManager.WakeLock wakeLock;
    private WindowManager windowManager;
    private FrameLayout bubbleView;
    private WindowManager.LayoutParams bubbleParams;

    private int initialX, initialY;
    private float initialTouchX, initialTouchY;
    private boolean isDragging = false;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getBooleanExtra("hide_bubble", false)) {
            hideBubble();
            return START_STICKY;
        }

        // Wake lock parcial
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && wakeLock == null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "chegoja:bg");
                wakeLock.acquire(4 * 60 * 60 * 1000L);
            }
        } catch (Exception e) {}

        // Notificacao persistente (bolha NÃO aparece aqui — só em onPause)
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_menu_directions)
                .setContentTitle("ChegoJá Motorista")
                .setContentText("Online — aguardando corridas")
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

        return START_STICKY;
    }

    // ---- BOLHA FLUTUANTE ----

    private void showBubble() {
        if (bubbleView != null) return;
        if (windowManager == null) return;

        int bubbleSize = dpToPx(54);
        int iconSize = dpToPx(32);

        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0xBB111827);
        bg.setStroke(dpToPx(2), 0x33000000);

        ImageView icon = new ImageView(this);
        icon.setImageResource(android.R.drawable.ic_menu_directions);
        icon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        icon.setPadding(iconSize / 5, iconSize / 5, iconSize / 5, iconSize / 5);
        FrameLayout.LayoutParams iconLp = new FrameLayout.LayoutParams(iconSize, iconSize);
        iconLp.gravity = Gravity.CENTER;
        icon.setLayoutParams(iconLp);

        bubbleView = new FrameLayout(this);
        bubbleView.setLayoutParams(new FrameLayout.LayoutParams(bubbleSize, bubbleSize));
        bubbleView.setBackground(bg);
        bubbleView.addView(icon);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            bubbleView.setElevation(dpToPx(10));
        }

        bubbleParams = new WindowManager.LayoutParams(
                bubbleSize, bubbleSize,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
        bubbleParams.gravity = Gravity.TOP | Gravity.START;
        bubbleParams.x = dpToPx(8);
        bubbleParams.y = dpToPx(220);
        bubbleParams.alpha = 0.80f;

        bubbleView.setOnTouchListener(onBubbleTouch);

        try {
            windowManager.addView(bubbleView, bubbleParams);
        } catch (SecurityException e) {}
    }

    public void hideBubble() {
        if (bubbleView != null && windowManager != null) {
            try { windowManager.removeView(bubbleView); } catch (Exception e) {}
            bubbleView = null;
        }
    }

    public static void hideBubble(Context context) {
        if (instance != null) instance.hideBubble();
    }

    public static void showBubble(Context context) {
        if (instance != null) instance.showBubble();
    }

    private final View.OnTouchListener onBubbleTouch = new View.OnTouchListener() {
        private long lastTapTime = 0;

        @Override
        public boolean onTouch(View v, MotionEvent event) {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    isDragging = false;
                    initialTouchX = event.getRawX();
                    initialTouchY = event.getRawY();
                    initialX = bubbleParams.x;
                    initialY = bubbleParams.y;
                    return true;

                case MotionEvent.ACTION_MOVE:
                    float dx = event.getRawX() - initialTouchX;
                    float dy = event.getRawY() - initialTouchY;
                    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) isDragging = true;
                    bubbleParams.x = initialX + (int) dx;
                    bubbleParams.y = initialY + (int) dy;
                    windowManager.updateViewLayout(bubbleView, bubbleParams);
                    return true;

                case MotionEvent.ACTION_UP:
                    if (!isDragging) {
                        long now = System.currentTimeMillis();
                        if (now - lastTapTime < 400) {
                            // Duplo toque = PiP
                            Intent pipIntent = new Intent(DriverBackgroundService.this, MainActivity.class);
                            pipIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                                    | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                            pipIntent.putExtra("enter_pip", true);
                            startActivity(pipIntent);
                        } else {
                            // Toque simples = abre app
                            openApp();
                        }
                        lastTapTime = now;
                    }
                    return true;
            }
            return false;
        }
    };

    private void openApp() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
    }

    // ---- FIM BOLHA ----

    @Override
    public void onDestroy() {
        instance = null;
        hideBubble();
        if (wakeLock != null && wakeLock.isHeld()) {
            try { wakeLock.release(); } catch (Exception e) {}
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Status Motorista",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Mantém o app ativo em segundo plano");
            ch.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private int dpToPx(int dp) {
        return (int) (dp * getResources().getDisplayMetrics().density + 0.5f);
    }

    // ---- API ESTÁTICA ----

    public static boolean isRunning() {
        return instance != null;
    }

    public static void start(Context context) {
        context.startForegroundService(new Intent(context, DriverBackgroundService.class));
    }

    public static void stop(Context context) {
        if (instance != null) {
            android.os.Handler h = new android.os.Handler(instance.getMainLooper());
            h.postDelayed(() -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    instance.stopForeground(STOP_FOREGROUND_REMOVE);
                }
                context.stopService(new Intent(context, DriverBackgroundService.class));
            }, 100);
        }
    }
}
