package it.abacozuzzurellone.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup.MarginLayoutParams;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    // Height of the camera cutout at the top, in CSS pixels: the page leaves that much room itself
    private int cutoutTopCss = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Apps targeting SDK 36 are always drawn edge-to-edge (the opt-out flag is ignored): the page would
        // slide under the status and navigation bars. Go edge-to-edge on every Android version, so they all
        // behave the same, and keep the game in its own area by giving the WebView margins as wide as the bars.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        // Behind the bars: black, like the classic system bars the app had before (white icons, see styles.xml)
        findViewById(android.R.id.content).setBackgroundColor(Color.BLACK);

        // With the bars hidden, Android's default keeps the window out of the camera cutout's strip: a black
        // band across the top. Draw there too; the page leaves the room for the camera itself (--inset-top).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        WebView webView = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
            // The keyboard (ime) counts too: edge-to-edge, the window no longer shrinks for it by itself,
            // and it would cover the guess field. Each side takes the largest of bars, keyboard and cutout,
            // except the top: the cutout there is left to the page, so its own background fills the strip
            // around the camera instead of a black margin.
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime()
            );
            Insets cutout = windowInsets.getInsets(WindowInsetsCompat.Type.displayCutout());
            MarginLayoutParams mlp = (MarginLayoutParams) v.getLayoutParams();
            mlp.leftMargin = Math.max(bars.left, cutout.left);
            mlp.topMargin = bars.top;
            mlp.rightMargin = Math.max(bars.right, cutout.right);
            mlp.bottomMargin = Math.max(bars.bottom, cutout.bottom);
            v.setLayoutParams(mlp);

            float density = getResources().getDisplayMetrics().density;
            cutoutTopCss = Math.round(Math.max(0, cutout.top - bars.top) / density);
            sendInsetTop();
            return WindowInsetsCompat.CONSUMED;
        });

        // The insets may arrive before the page: send them again once it is loaded
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                sendInsetTop();
            }
        });

        hideSystemBars();
    }

    // Tell the page how much room to leave at the top for the camera (style.css, --inset-top)
    private void sendInsetTop() {
        getBridge().getWebView().evaluateJavascript(
            "document.documentElement.style.setProperty('--inset-top', '" + cutoutTopCss + "px')", null);
    }

    // Immersive mode: the game takes the whole screen, status and navigation bars hidden.
    // A swipe from the edge shows them for a moment, over the game; they hide again by themselves.
    // Hidden bars report no insets, so the margins above leave only the camera cutout and the keyboard.
    private void hideSystemBars() {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    // Back from another app, or a system popup closed: the bars may have come back, hide them again
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemBars();
        }
    }
}
