package expo.modules.livetimer

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LiveTimerModule : Module() {
  private var label = "Focus"
  private var openRequested = false

  private fun notifications(): LiveTimerNotifications = LiveTimerNotifications(
    requireNotNull(appContext.reactContext).applicationContext)

  private fun safely(block: () -> Unit) {
    try { block() } catch (error: Exception) {
      Log.w("LiveTimer", "Timer notification unavailable", error)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("LiveTimer")
    Events("onOpenTimer")

    // Session state is not restored by the app after process death. Clear only on
    // a new React context, never when the activity merely enters the background.
    OnCreate { safely { notifications().stop() } }

    Function("startLiveTimer") { endsAtMs: Double, value: String ->
      safely {
        label = value
        notifications().newSession()
        notifications().running(endsAtMs.toLong(), label)
      }
    }
    Function("pauseLiveTimer") { remainingMs: Double, timeoutMs: Double ->
      safely { notifications().paused(remainingMs.toLong(), timeoutMs.toLong(), label) }
    }
    Function("resumeLiveTimer") { endsAtMs: Double ->
      safely { notifications().running(endsAtMs.toLong(), label) }
    }
    Function("stopLiveTimer") { safely { notifications().stop() } }

    OnNewIntent { intent ->
      safely {
        if (intent.getBooleanExtra(OPEN_TIMER, false)) {
          intent.removeExtra(OPEN_TIMER)
          openRequested = true
          sendEvent("onOpenTimer", emptyMap<String, Any>())
        }
      }
    }
    Function("consumeOpenRequest") {
      var requested = false
      safely {
        val intent = appContext.currentActivity?.intent
        requested = openRequested || intent?.getBooleanExtra(OPEN_TIMER, false) == true
        openRequested = false
        intent?.removeExtra(OPEN_TIMER)
      }
      requested
    }
  }
}
