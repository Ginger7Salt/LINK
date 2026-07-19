package top.babylink.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Base64;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;
import java.util.List;

public class LinkKeepAliveService extends Service {
    public static final String ACTION_START = "top.babylink.app.action.START_KEEP_ALIVE";
    public static final String ACTION_STOP = "top.babylink.app.action.STOP_KEEP_ALIVE";
    public static final String EXTRA_WAKE_LOCK = "wakeLock";

    private static final String KEEP_ALIVE_CHANNEL_ID = "babylink_keep_alive";
    private static final String MESSAGE_CHANNEL_ID = "babylink_messages";
    private static final int KEEP_ALIVE_NOTIFICATION_ID = 2101;
    private static volatile boolean running;
    private static volatile boolean wakeLockActive;

    private PowerManager.WakeLock wakeLock;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        boolean useWakeLock = intent == null || intent.getBooleanExtra(EXTRA_WAKE_LOCK, true);
        updateWakeLock(useWakeLock);
        startForeground(KEEP_ALIVE_NOTIFICATION_ID, buildKeepAliveNotification(this));
        running = true;
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        running = false;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    public static boolean isRunning() {
        return running;
    }

    public static boolean isWakeLockActive() {
        return wakeLockActive;
    }

    public static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel keepAliveChannel = new NotificationChannel(
            KEEP_ALIVE_CHANNEL_ID,
            context.getString(R.string.keep_alive_channel_name),
            NotificationManager.IMPORTANCE_LOW
        );
        keepAliveChannel.setDescription(context.getString(R.string.keep_alive_channel_description));
        keepAliveChannel.setShowBadge(false);
        manager.createNotificationChannel(keepAliveChannel);
        NotificationChannel messageChannel = new NotificationChannel(
            MESSAGE_CHANNEL_ID,
            context.getString(R.string.message_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        messageChannel.setDescription(context.getString(R.string.message_channel_description));
        manager.createNotificationChannel(messageChannel);
    }

    public static void showMessageNotification(Context context, String title, String body, List<String> messages, String tag, String icon, String url) {
        createNotificationChannels(context);
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent == null) launchIntent = new Intent(context, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (url != null && !url.trim().isEmpty()) launchIntent.setData(Uri.parse(url));
        int requestCode = tag == null ? 0 : tag.hashCode();
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Bitmap avatar = decodeNotificationAvatar(icon);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, MESSAGE_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_keep_alive_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        if (avatar != null) {
            Person sender = new Person.Builder()
                .setName(title)
                .setIcon(IconCompat.createWithBitmap(avatar))
                .build();
            Person localUser = new Person.Builder()
                .setName(context.getString(R.string.app_name))
                .build();
            NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(localUser)
                .setGroupConversation(false);
            long now = System.currentTimeMillis();
            for (int index = 0; index < messages.size(); index += 1) {
                style.addMessage(messages.get(index), now - (messages.size() - index - 1L) * 1_000L, sender);
            }
            builder.setStyle(style);
        } else {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }
        Notification notification = builder.build();
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(tag, requestCode, notification);
    }

    private static Bitmap decodeNotificationAvatar(String source) {
        if (source == null || source.trim().isEmpty() || !source.startsWith("data:image/")) return null;
        int commaIndex = source.indexOf(',');
        if (commaIndex < 0 || commaIndex >= source.length() - 1) return null;
        try {
            byte[] bytes = Base64.decode(source.substring(commaIndex + 1), Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException error) {
            return null;
        }
    }

    private static Notification buildKeepAliveNotification(Context context) {
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent == null) launchIntent = new Intent(context, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            KEEP_ALIVE_NOTIFICATION_ID,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(context, KEEP_ALIVE_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_keep_alive_notification)
            .setContentTitle(context.getString(R.string.keep_alive_notification_title))
            .setContentText(context.getString(R.string.keep_alive_notification_text))
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    private void updateWakeLock(boolean enabled) {
        if (!enabled) {
            releaseWakeLock();
            return;
        }
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager manager = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = manager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "BabyLink:KeepAlive");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
        wakeLockActive = true;
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        wakeLockActive = false;
    }
}