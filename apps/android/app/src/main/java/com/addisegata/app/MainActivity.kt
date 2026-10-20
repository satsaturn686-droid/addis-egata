package com.addisegata.app

import android.app.Activity
import android.os.Bundle
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONObject
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.io.OutputStreamWriter
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val api = "https://addis-egata-api.onrender.com"
    private val executor = Executors.newSingleThreadExecutor()
    private val prefs by lazy {
        getSharedPreferences("addis_full_app", MODE_PRIVATE)
    }

    private lateinit var root: LinearLayout
    private lateinit var status: TextView
    private var token: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        token = prefs.getString("token", "") ?: ""
        showLoading()

        if (token.isNotBlank()) {
            request("GET", "/app-auth/me", null, true) { code, body ->
                if (code == 200) showDraws()
                else {
                    clearSession()
                    showLogin()
                }
            }
        } else {
            showLogin()
        }
    }

    private fun request(
        method: String,
        path: String,
        data: JSONObject? = null,
        authenticated: Boolean = false,
        done: (Int, JSONObject) -> Unit
    ) {
        executor.execute {
            var connection: HttpURLConnection? = null
            var code = 0
            var result = JSONObject()

            try {
                connection = (URL(api + path).openConnection() as HttpURLConnection).apply {
                    requestMethod = method
                    connectTimeout = 20000
                    readTimeout = 20000
                    setRequestProperty("Accept", "application/json")
                    if (data != null) {
                        doOutput = true
                        setRequestProperty("Content-Type", "application/json")
                    }
                    if (authenticated && token.isNotBlank()) {
                        setRequestProperty("Authorization", "Bearer $token")
                    }
                }

                if (data != null) {
                    OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use {
                        it.write(data.toString())
                    }
                }

                code = connection.responseCode
                val stream = if (code in 200..399) {
                    connection.inputStream
                } else {
                    connection.errorStream
                }
                val text = stream?.bufferedReader()?.use { it.readText() } ?: "{}"
                result = try {
                    JSONObject(text)
                } catch (_: Exception) {
                    JSONObject().put("message", text)
                }
            } catch (e: Exception) {
                result = JSONObject().put(
                    "message",
                    e.message ?: "ከServer ጋር መገናኘት አልተቻለም።"
                )
            } finally {
                connection?.disconnect()
            }

            runOnUiThread { done(code, result) }
        }
    }

    private fun showLoading() {
        screen("ADDIS ዕጣ", "እባክዎ ይጠብቁ…")
    }

    private fun showLogin() {
        screen("ADDIS ዕጣ", "እድልህን ዲጂታል አድርግ")
        val identifier = field("Username ወይም ስልክ ቁጥር")
        val password = field("Password")
        password.inputType = 129

        action("ግባ") {
            val id = identifier.text.toString().trim()
            val pass = password.text.toString()
            if (id.isBlank() || pass.isBlank()) {
                message("Username/ስልክ ቁጥር እና Password ያስገቡ።")
                return@action
            }
            status.text = "እየገባ ነው…"
            request(
                "POST", "/app-auth/login",
                JSONObject().put("loginIdentifier", id).put("password", pass)
            ) { code, body ->
                if (code == 200 && body.optString("token").isNotBlank()) {
                    token = body.getString("token")
                    prefs.edit().putString("token", token).apply()
                    showDraws()
                } else {
                    message(body.optString("message", "መግባት አልተሳካም።"))
                }
            }
        }

        action("አዲስ መለያ ፍጠር") { showRegister() }
    }

    private fun showRegister() {
        screen("ADDIS ዕጣ", "አዲስ መለያ ይፍጠሩ")
        val identifier = field("Username ወይም ስልክ ቁጥር")
        val firstName = field("ስም (አማራጭ)")
        val lastName = field("የአባት ስም (አማራጭ)")
        val password = field("Password — ቢያንስ 8 ቁምፊ")
        password.inputType = 129

        action("መለያ ፍጠር") {
            val id = identifier.text.toString().trim()
            val pass = password.text.toString()
            if (id.isBlank() || pass.length < 8) {
                message("Username/ስልክ ቁጥር ያስገቡ፤ Password ቢያንስ 8 ቁምፊ ይሁን።")
                return@action
            }

            val payload = JSONObject()
                .put("loginIdentifier", id)
                .put("password", pass)
                .put("firstName", firstName.text.toString().trim())
                .put("lastName", lastName.text.toString().trim())

            status.text = "መለያው እየተፈጠረ ነው…"
            request("POST", "/app-auth/register", payload) { code, body ->
                if (code == 201) {
                    message("መለያው ተፈጥሯል። አሁን በመለያዎ ይግቡ።")
                    showLogin()
                } else {
                    message(body.optString("message", "መለያ መፍጠር አልተሳካም።"))
                }
            }
        }

        action("ወደ መግቢያ ተመለስ") { showLogin() }
    }

    private fun showDraws() {
        screen("ADDIS ዕጣ", "የሚገኙ ዕጣዎች")
        status.text = "ዕጣዎች እየተጫኑ ነው…"

        request("GET", "/draws") { code, body ->
            if (code != 200) {
                status.text = body.optString("message", "ዕጣዎችን መጫን አልተቻለም።")
                action("እንደገና ሞክር") { showDraws() }
                action("ውጣ") { logout() }
                return@request
            }

            root.removeView(status)
            val draws = body.optJSONArray("draws") ?: JSONArray()
            if (draws.length() == 0) {
                addText("በአሁኑ ጊዜ የሚገኝ ዕጣ የለም።")
            } else {
                for (i in 0 until draws.length()) {
                    val draw = draws.optJSONObject(i) ?: continue
                    val name = draw.optString("name",
                        draw.optString("title", "ዕጣ"))
                    val prize = draw.optString("prizeName",
                        draw.optString("prize", ""))
                    val fee = draw.opt("entryFee")?.toString() ?: "—"
                    val total = draw.opt("totalNumbers")?.toString() ?: "—"
                    addText(
                        "🎟️ $name\n" +
                        (if (prize.isNotBlank()) "🏆 ሽልማት፦ $prize\n" else "") +
                        "💰 የመግቢያ ክፍያ፦ $fee ETB\n" +
                        "🔢 የቁጥር ብዛት፦ $total"
                    )
                }
            }

            action("ዕጣዎችን አድስ") { showDraws() }
            action("ውጣ") { logout() }
        }
    }

    private fun logout() {
        request("POST", "/app-auth/logout", JSONObject(), true) { _, _ ->
            clearSession()
            showLogin()
        }
    }

    private fun clearSession() {
        token = ""
        prefs.edit().remove("token").apply()
    }

    private fun screen(title: String, subtitle: String) {
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 28, 32, 28)
            gravity = Gravity.TOP
        }

        val scroll = ScrollView(this)
        scroll.addView(root)
        setContentView(scroll)

        addText(title, 26, true)
        addText(subtitle, 17)
        status = TextView(this).apply {
            textSize = 15f
            setPadding(0, 20, 0, 12)
        }
        root.addView(status)
    }

    private fun addText(text: String, size: Int = 16, bold: Boolean = false) {
        root.addView(TextView(this).apply {
            this.text = text
            textSize = size.toFloat()
            if (bold) setTypeface(null, Typeface.BOLD)
            setPadding(0, 12, 0, 12)
        })
    }

    private fun field(hintText: String): EditText {
        val input = EditText(this).apply {
            hint = hintText
            textSize = 16f
            setSingleLine(true)
        }
        root.addView(input)
        return input
    }

    private fun action(label: String, run: () -> Unit) {
        root.addView(Button(this).apply {
            text = label
            setOnClickListener { run() }
        })
    }

    private fun message(text: String) {
        status.text = text
    }
}
