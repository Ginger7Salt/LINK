package top.babylink.app;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LinkUpdater")
public class LinkUpdaterPlugin extends Plugin {
    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            PackageInfo packageInfo = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? packageInfo.getLongVersionCode()
                : packageInfo.versionCode;
            JSObject result = new JSObject();
            result.put("versionCode", versionCode);
            result.put("versionName", packageInfo.versionName == null ? "" : packageInfo.versionName);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Unable to read app version.", exception);
        }
    }

    @PluginMethod
    public void openDownload(PluginCall call) {
        String rawUrl = call.getString("url", "");
        Uri uri = Uri.parse(rawUrl);
        String host = uri.getHost();
        boolean trustedHost = host != null && (host.equals("babylink.top") || host.endsWith(".babylink.top"));
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !trustedHost) {
            call.reject("Only trusted BabyLink HTTPS downloads are allowed.");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception exception) {
            call.reject("Unable to open the system browser.", exception);
        }
    }
}