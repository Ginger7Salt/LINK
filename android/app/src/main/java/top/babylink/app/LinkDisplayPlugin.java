package top.babylink.app;

import android.app.Activity;
import android.content.Context;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LinkDisplay")
public class LinkDisplayPlugin extends Plugin {
    private static final String PREFERENCES = "link_display";
    private static final String FULLSCREEN_KEY = "fullscreen_enabled";
    private static final long[] RETRY_DELAYS_MS = {60L, 250L, 750L};

    @PluginMethod
    public void setFullscreen(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        getContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(FULLSCREEN_KEY, enabled)
            .apply();
        getActivity().runOnUiThread(() -> {
            applyFullscreen(getActivity(), enabled);
            getActivity().getWindow().getDecorView().postDelayed(() -> {
                WindowInsetsCompat insets = androidx.core.view.ViewCompat.getRootWindowInsets(getActivity().getWindow().getDecorView());
                boolean statusBarVisible = insets != null && insets.isVisible(WindowInsetsCompat.Type.statusBars());
                boolean navigationBarVisible = insets != null && insets.isVisible(WindowInsetsCompat.Type.navigationBars());
                JSObject result = new JSObject();
                result.put("enabled", enabled);
                result.put("applied", !enabled || (!statusBarVisible && !navigationBarVisible));
                result.put("statusBarVisible", statusBarVisible);
                result.put("navigationBarVisible", navigationBarVisible);
                call.resolve(result);
            }, 900L);
        });
    }

    static void applyStoredFullscreen(Activity activity) {
        boolean enabled = activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getBoolean(FULLSCREEN_KEY, false);
        applyFullscreen(activity, enabled);
    }

    private static void applyFullscreen(Activity activity, boolean enabled) {
        applySystemBars(activity, enabled);
        View decorView = activity.getWindow().getDecorView();
        for (long delay : RETRY_DELAYS_MS) {
            decorView.postDelayed(() -> applySystemBars(activity, enabled), delay);
        }
    }

    private static void applySystemBars(Activity activity, boolean enabled) {
        Window window = activity.getWindow();
        View decorView = window.getDecorView();
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if (enabled) {
            WindowCompat.setDecorFitsSystemWindows(window, true);
            window.clearFlags(WindowManager.LayoutParams.FLAG_FORCE_NOT_FULLSCREEN);
            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            WindowManager.LayoutParams attributes = window.getAttributes();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }
            window.setAttributes(attributes);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                decorView.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                );
            } else {
                decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController platformController = window.getInsetsController();
                if (platformController != null) {
                    platformController.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    platformController.hide(WindowInsets.Type.systemBars());
                }
            }
            controller.hide(WindowInsetsCompat.Type.systemBars());
        } else {
            WindowCompat.setDecorFitsSystemWindows(window, true);
            window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            WindowManager.LayoutParams attributes = window.getAttributes();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                attributes.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
                window.setAttributes(attributes);
            }
            decorView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController platformController = window.getInsetsController();
                if (platformController != null) platformController.show(WindowInsets.Type.systemBars());
            }
            controller.show(WindowInsetsCompat.Type.systemBars());
        }
    }
}