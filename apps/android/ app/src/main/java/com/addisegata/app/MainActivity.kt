
package com.addisegata.app

import android.app.Activity
import android.os.Bundle
import android.graphics.Typeface
import android.view.Gravity
import android.view.ViewGroup
import android.widget.*
import android.graphics.Color
import org.json.JSONObject
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.io.OutputStreamWriter
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val api = "https://addis-egata-api.onrender.com"
    private val prefs by lazy {
        getSharedPreferences("addis_full_app", MODE_PRIVATE)
    }
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var root: LinearLayout
    private var token: String
        get() = prefs.getString("token", "") ?: ""
        set(value) { prefs.edit().putString("token", value).apply() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showHome()
        if (token.isNotBlank()) loadMe()
        else showLogin()
    }

    private fun setup(title: String) {
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 28, 24, 24)
            setBackgroundColor(Color.rgb(248, 249, 250))
        }
        val scroll = ScrollView(this)
        scroll.addView(root)
        setContentView(scroll)

        root.addView(TextView(this).apply {
            text = title
            textSize = 26f
            setTextColor(Color.rgb(20, 90, 55))
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, 8, 0, 24)
        })
    }

    private fun field(hint: String, password: Boolean = false): EditText {
        val e = EditText(this)
        e.hint = hint
        e.textSize = 16f
        if (password) e.inputType = 129
        root.addView(e, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ))
        return e
    }

    private fun button(label: String, action: () -> Unit) {
        val b = Button(this)
        b.text = label
        b.setOnClickListener { action() }
        root.addView(b, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ))
    }

    private fun message(text: String) {
        runOnUiThread {
            Toast.makeText(this, text, Toast.LENGTH_LONG).show()
        }
    }

    private fun request(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        auth: Boolean = true
    ): JSONObject {
        val conn = (URL(api + path).openConnection() as HttpURLConnection)
        conn.requestMethod = method
        conn.connectTimeout = 20000
        conn.readTimeout = 20000
        conn.setRequestProperty("Accept", "application/json")
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
        }
        if (auth && token.isNotBlank()) {
            conn.setRequestProperty("Authorization", "Bearer $token")
        }
        try {
            if (body != null) {
                OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use {
                    it.write(body.toString())
                }
            }
            val stream = if (conn.responseCode in 200..299)
                conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: "{}"
            val json = JSONObject(text)
            if (conn.responseCode !in 200..299) {
                throw Exception(json.optString("error", "Request failed"))
            }
            return json
        } finally {
            conn.disconnect()
        }
    }

    private fun work(task: () -> Unit) {
        executor.execute {
            try { task() }
            catch (e: Exception) {
                message(e.message ?: "የኔትወርክ ችግር ተፈጥሯል")
            }
        }
    }

    private fun showHome() {
        setup("ADDIS ዕጣ\nእድልህን ዲጂታል አድርግ")
        button("Login", ::showLogin)
        button("አዲስ መለያ ፍጠር", ::showRegister)
        button("የዕጣ ዝርዝር", ::loadDraws)
    }

    private fun showLogin() {
        setup("ADDIS ዕጣ\nLogin")
        val identifier = field("Username ወይም Phone Number")
        val password = field("Password", true)

        button("ግባ") {
            val id = identifier.text.toString().trim()
            val pw = password.text.toString()
            if (id.isBlank() || pw.isBlank()) {
                message("ሁሉንም ቦታ ሙላ")
            } else work {
                val result = request(
                    "/app-auth/login",
                    "POST",
                    JSONObject().put("identifier", id).put("password", pw),
                    false
                )
                val session = result.optString("token")
                    .ifBlank { result.optString("sessionToken") }
                if (session.isBlank()) throw Exception(
                    "Login ተሳክቷል ወይም የAPI የመልስ ቅርጽ መፈተሽ ያስፈልጋል"
                )
                token = session
                runOnUiThread { loadMe() }
            }
        }
        button("አዲስ መለያ ፍጠር", ::showRegister)
        button("የዕጣ ዝርዝር", ::loadDraws)
    }

    private fun showRegister() {
        setup("ADDIS ዕጣ\nመለያ ፍጠር")
        val identifier = field("Username ወይም Phone Number")
        val password = field("Password (ቢያንስ 8 ቁምፊ)", true)
        val confirm = field("Password እንደገና", true)

        button("መለያ ፍጠር") {
            val id = identifier.text.toString().trim()
            val pw = password.text.toString()
            if (id.isBlank() || pw.length < 8 ||
                pw != confirm.text.toString()) {
                message("መረጃውን አረጋግጥ፤ Password ቢያንስ 8 ቁምፊ መሆን አለበት")
            } else work {
                val result = request(
                    "/app-auth/register",
                    "POST",
                    JSONObject().put("identifier", id).put("password", pw),
                    false
                )
                val session = result.optString("token")
                    .ifBlank { result.optString("sessionToken") }
                if (session.isBlank()) throw Exception(
                    "መለያው ተፈጥሯል ወይም የAPI መልስ ቅርጽ መፈተሽ ያስፈልጋል፤ Login ሞክር"
                )
                token = session
                runOnUiThread { loadMe() }
            }
        }
        button("ወደ Login ተመለስ", ::showLogin)
    }

    private fun loadMe() {
        if (token.isBlank()) {
            showLogin()
            return
        }
        work {
            val result = request("/app-auth/me")
            runOnUiThread {
                setup("ADDIS ዕጣ")
                root.addView(TextView(this).apply {
                    text = "እንኳን ደህና መጣህ!"
                    textSize = 20f
                    gravity = Gravity.CENTER
                    setPadding(0, 12, 0, 16)
                })
                root.addView(TextView(this).apply {
                    text = result.toString(2)
                    textSize = 13f
                })
                button("የዕጣ ዝርዝር", ::loadDraws)
                button("ውጣ", ::logout)
            }
        }
    }

    private fun loadDraws() {
        work {
            val result = request("/draws", auth = false)
            val draws = result.optJSONArray("draws")
                ?: result.optJSONArray("data")
                ?: JSONArray()
            runOnUiThread {
                setup("የዕጣ ዝርዝር")
                if (draws.length() == 0) {
                    root.addView(TextView(this).apply {
                        text = "በአሁኑ ጊዜ የሚታይ ዕጣ የለም።"
                        textSize = 18f
                    })
                }
                for (i in 0 until draws.length()) {
                    val draw = draws.optJSONObject(i) ?: continue
                    val name = draw.optString("name", "ዕጣ")
                    val fee = draw.opt("entryFee")?.toString() ?: "—"
                    val numbers = draw.opt("totalNumbers")?.toString() ?: "—"
                    root.addView(TextView(this).apply {
                        text = "$name\nየመግቢያ ክፍያ: $fee ETB\nየቁጥር ብዛት: $numbers"
                        textSize = 18f
                        setPadding(8, 16, 8, 16)
                    })
                }
                button("Login", ::showLogin)
                button("ተመለስ", ::showHome)
            }
        }
    }

    private fun logout() {
        work {
            try { request("/app-auth/logout", "POST", JSONObject()) }
            catch (_: Exception) { }
            token = ""
            runOnUiThread { showLogin() }
        }
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }
}
