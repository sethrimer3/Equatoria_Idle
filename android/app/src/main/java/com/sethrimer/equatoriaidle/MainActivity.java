package com.sethrimer.equatoriaidle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Intercept the Android back button.
     *
     * Calls window.__equatoriaBack() in the WebView, which is registered by
     * src/capacitor-android.ts. The JS function:
     *   - switches to the equation tab if a secondary tab is active, returns false
     *   - shows a confirm dialog on the main screen, returns true/false
     *
     * If the function returns true the activity is finished; otherwise nothing happens.
     * If the function is not yet registered (during startup), do nothing.
     */
    @Override
    public void onBackPressed() {
        getBridge().getWebView().evaluateJavascript(
            "(function(){ return window.__equatoriaBack ? !!window.__equatoriaBack() : false; })()",
            result -> {
                if ("true".equals(result)) {
                    runOnUiThread(this::finishAffinity);
                }
            }
        );
    }
}
