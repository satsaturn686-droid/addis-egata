
package com.addisegata.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
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
    private var token = ""
    private var selectedDraw = JSONObject()
    private var selectedEntry = JSONObject()
    private var selectedNumber = 0
    private var telebirrNumber = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        token = prefs.getString("token", "") ?: ""
        showLoading()

        if (token.isNotBlank()) {
            request("GET", "/app-auth/me", auth = true) { code, _ ->
                if (code == 200) showDraws() else {
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
        auth: Boolean = false,
        done: (Int, JSONObject) -> Unit
    ) {
        executor.execute {
            var code = 0
            var result = JSONObject()
            var connection: HttpURLConnection? = null

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

                    if (auth && token.isNotBlank()) {
                        setRequestProperty("Authorization", "Bearer $token")
                    }
                }

                if (data != null) {
                    OutputStreamWriter(
                        connection.outputStream,
                        Charsets.UTF_8
                    ).use { it.write(data.toString()) }
                }

                code = connection.responseCode
                val stream = if (code in 200..399) {
                    connection.inputStream
                } else {
                    connection.errorStream
                }

                val body = stream?.bufferedReader()?.use { it.readText() } ?: "{}"
                result = try {
                    JSONObject(body)
                } catch (_: Exception) {
                    JSONObject().put("message", body)
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
        screen("ADDIS ዕጣ", "እድልህን ዲጂታል አድርግ")
        status.text = "እባክዎ ይጠብቁ…"
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

            message("እየገባ ነው…")
            request(
                "POST",
                "/app-auth/login",
                JSONObject()
                    .put("loginIdentifier", id)
                    .put("password", pass)
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

            message("መለያው እየተፈጠረ ነው…")
            request("POST", "/app-auth/register", payload) { code, body ->
                if (code == 201) {
                    showLogin()
                    message("መለያው ተፈጥሯል። አሁን ይግቡ።")
                } else {
                    message(body.optString("message", "መለያ መፍጠር አልተሳካም።"))
                }
            }
        }

        action("ወደ መግቢያ ተመለስ") { showLogin() }
    }

    private fun showDraws() {
        screen("ADDIS ዕጣ", "የሚገኙ ዕጣዎች")
        message("ዕጣዎች እየተጫኑ ነው…")

        request("GET", "/draws") { code, body ->
            if (code != 200) {
                message(body.optString("message", "ዕጣዎችን መጫን አልተቻለም።"))
                action("እንደገና ሞክር") { showDraws() }
                action("ውጣ") { logout() }
                return@request
            }

            status.text = ""
            val draws = body.optJSONArray("draws") ?: JSONArray()

            if (draws.length() == 0) {
                addText("በአሁኑ ጊዜ የሚገኝ ዕጣ የለም።")
            }

            for (i in 0 until draws.length()) {
                val draw = draws.optJSONObject(i) ?: continue
                val name = draw.optString("name", "ዕጣ")
                val prize = draw.optString("prizeName", "—")
                val description = draw.optString("prizeDescription", "")
                val fee = draw.opt("entryFee")?.toString() ?: "—"
                val total = draw.optInt("totalNumbers", 0)
                val filled = draw.optInt("filledNumbers", 0)
                val statusText = draw.optString("status", "")

                addText(
                    "🎟️ $name\n" +
                    "🏆 ሽልማት፦ $prize\n" +
                    (if (description.isNotBlank() && description != "null")
                        "📝 $description\n" else "") +
                    "💰 የመግቢያ ክፍያ፦ $fee ETB\n" +
                    "🔢 የቁጥር ብዛት፦ $total\n" +
                    "✅ የተያዙ፦ $filled\n" +
                    "📌 ሁኔታ፦ $statusText",
                    16,
                    true
                )

                action("ዕጣውን እና ቁጥሮችን ክፈት") {
                    openDraw(draw)
                }
                addDivider()
            }

            action("የእኔ ቁጥሮች") { showMyEntries() }
            action("ዕጣዎችን አድስ") { showDraws() }
            action("ውጣ") { logout() }
        }
    }

    private fun openDraw(draw: JSONObject) {
        selectedDraw = draw
        selectedNumber = 0
        val id = draw.optString("id")

        screen("ADDIS ዕጣ", draw.optString("name", "የዕጣ ዝርዝር"))
        message("የዕጣ መረጃ እየተጫነ ነው…")

        request("GET", "/draws/$id") { code, body ->
            if (code != 200) {
                message(body.optString("message", "የዕጣ መረጃ መጫን አልተሳካም።"))
                action("ተመለስ") { showDraws() }
                return@request
            }

            selectedDraw = body.optJSONObject("draw") ?: draw
            val prizes = body.optJSONArray("prizes") ?: JSONArray()

            screen("ADDIS ዕጣ", selectedDraw.optString("name", "የዕጣ ዝርዝር"))
            addText("🏆 ሽልማት፦ ${selectedDraw.optString("prizeName", "—")}", 20, true)
            addText("💰 ክፍያ፦ ${selectedDraw.opt("entryFee")} ETB")
            addText("🔢 ቁጥሮች፦ ${selectedDraw.optInt("totalNumbers")}")
            addText("📌 ሁኔታ፦ ${selectedDraw.optString("status")}")

            val description = selectedDraw.optString("description", "")
            if (description.isNotBlank() && description != "null") {
                addText(description)
            }

            val prizeDescription = selectedDraw.optString("prizeDescription", "")
            if (prizeDescription.isNotBlank() && prizeDescription != "null") {
                addText("የሽልማት መግለጫ፦ $prizeDescription")
            }

            if (prizes.length() > 0) {
                addText("የሽልማት ዝርዝር", 18, true)
                for (i in 0 until prizes.length()) {
                    val p = prizes.optJSONObject(i) ?: continue
                    addText("${p.optInt("rank")}ኛ ቦታ፦ ${p.opt("amount")} ETB")
                }
            }

            val total = selectedDraw.optInt("totalNumbers", 0)
            val occupied = selectedDraw.optJSONArray("occupiedNumbers") ?: JSONArray()
            val taken = HashSet<Int>()
            for (i in 0 until occupied.length()) taken.add(occupied.optInt(i))

            addText("ቁጥር ይምረጡ (የተያዙት አይመረጡም)", 18, true)

            if (total > 0) {
                val grid = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                }
                root.addView(grid)

                var row: LinearLayout? = null
                for (number in 1..total) {
                    if ((number - 1) % 5 == 0) {
                        row = LinearLayout(this).apply {
                            orientation = LinearLayout.HORIZONTAL
                            gravity = Gravity.CENTER
                        }
                        grid.addView(row)
                    }

                    val button = Button(this).apply {
                        text = number.toString()
                        isEnabled = number !in taken &&
                            selectedDraw.optString("status") == "open"
                        textSize = 12f
                        setPadding(0, 2, 0, 2)
                    }

                    button.setOnClickListener {
                        selectedNumber = number
                        message("ቁጥር $number መርጠዋል።")
                        for (j in 0 until grid.childCount) {
                            val line = grid.getChildAt(j) as? LinearLayout ?: continue
                            for (k in 0 until line.childCount) {
                                val b = line.getChildAt(k) as? Button ?: continue
                                b.isSelected = b.text.toString().toIntOrNull() == number
                            }
                        }
                    }

                    row?.addView(button, LinearLayout.LayoutParams(0, 48, 1f))
                }
            }

            action("የመረጥኩትን ቁጥር ያዝ") {
                reserveSelectedNumber()
            }
            action("የእኔ ቁጥሮች") { showMyEntries() }
            action("ወደ ዕጣዎች ተመለስ") { showDraws() }
        }
    }

    private fun reserveSelectedNumber() {
        if (selectedNumber < 1) {
            message("በመጀመሪያ ቁጥር ይምረጡ።")
            return
        }

        val drawId = selectedDraw.optString("id")
        message("ቁጥር $selectedNumber እየተያዘ ነው…")

        request(
            "POST",
            "/entries/reserve",
            JSONObject()
                .put("drawId", drawId)
                .put("number", selectedNumber),
            true
        ) { code, body ->
            if (code == 201) {
                selectedEntry = body.optJSONObject("entry") ?: JSONObject()
                showPayment()
            } else {
                message(body.optString("message", "ቁጥሩን መያዝ አልተቻለም።"))
                action("ወደ ዕጣ ተመለስ") { openDraw(selectedDraw) }
            }
        }
    }

    private fun showPayment() {
        screen("ADDIS ዕጣ", "የTelebirr ክፍያ")
        val entryId = selectedEntry.optString("id")
        val number = selectedEntry.optInt("number", selectedNumber)
        val fee = selectedDraw.opt("entryFee")?.toString() ?: "—"

        addText("🎟️ ${selectedDraw.optString("name")}", 18, true)
        addText("🔢 የመረጡት ቁጥር፦ $number")
        addText("💰 የሚከፈል፦ $fee ETB")
        addText("⏳ ቁጥሩ ለ30 ደቂቃ ይያዛል። በዚህ ጊዜ ውስጥ ክፍያውን ያስገቡ።")

        val reference = field("የTelebirr Transaction Reference")
        val sender = field("የላኪው ሙሉ ስም (አማራጭ)")

        message("የTelebirr ቁጥር እየተጫነ ነው…")
        request("GET", "/payments/settings", auth = true) { code, body ->
            telebirrNumber = if (code == 200) {
                body.optJSONObject("settings")?.optString("telebirrNumber", "") ?: ""
            } else ""
            status.text = if (telebirrNumber.isNotBlank()) {
                "📱 የTelebirr ቁጥር፦ $telebirrNumber"
            } else {
                "የTelebirr ቁጥር መጫን አልተቻለም። ከአስተዳደሩ ያረጋግጡ።"
            }
        }

        action("የTelebirr ቁጥር ቅዳ") {
            if (telebirrNumber.isBlank()) {
                message("የTelebirr ቁጥሩ ገና አልተጫነም።")
            } else {
                val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(ClipData.newPlainText("Telebirr", telebirrNumber))
                message("የTelebirr ቁጥሩ ተቀድቷል።")
            }
        }

        action("ክፍያውን አስገባ") {
            val ref = reference.text.toString().trim()
            val name = sender.text.toString().trim()

            if (entryId.isBlank() || ref.isBlank()) {
                message("የTelebirr Transaction Reference ያስገቡ።")
                return@action
            }

            if (ref.length > 200 || name.length > 200) {
                message("ያስገቡት መረጃ ከሚፈቀደው ርዝመት በላይ ነው።")
                return@action
            }

            val payload = JSONObject()
                .put("entryId", entryId)
                .put("transactionReference", ref)

            if (name.isNotBlank()) payload.put("senderName", name)

            message("የክፍያ ጥያቄው እየተላከ ነው…")
            request("POST", "/payments/telebirr", payload, true) { code, body ->
                if (code == 201) {
                    screen("ADDIS ዕጣ", "የክፍያ ጥያቄ")
                    addText("✅ የክፍያ ጥያቄዎ ተልኳል።", 20, true)
                    addText("🔢 ቁጥር፦ $number")
                    addText("💰 ክፍያ፦ $fee ETB")
                    addText("አስተዳደሩ ክፍያውን እስኪያረጋግጥ ይጠብቁ።")
                    action("የእኔ ቁጥሮች") { showMyEntries() }
                    action("ወደ ዕጣዎች ተመለስ") { showDraws() }
                } else {
                    message(body.optString("message", "የክፍያ ጥያቄው አልተላከም።"))
                }
            }
        }

        action("ወደ ዕጣ ተመለስ") { openDraw(selectedDraw) }
    }

    private fun showMyEntries() {
        screen("ADDIS ዕጣ", "የእኔ ቁጥሮች")
        message("የእርስዎ ቁጥሮች እየተጫኑ ነው…")

        request("GET", "/entries/mine", auth = true) { code, body ->
            if (code != 200) {
                message(body.optString("message", "የእኔ ቁጥሮችን መጫን አልተቻለም።"))
                action("ዳግም ሞክር") { showMyEntries() }
                action("ወደ ዕጣዎች ተመለስ") { showDraws() }
                return@request
            }

            status.text = ""
            val entries = body.optJSONArray("entries") ?: JSONArray()

            if (entries.length() == 0) {
                addText("እስካሁን የያዙት ቁጥር የለም።")
            }

            for (i in 0 until entries.length()) {
                val entry = entries.optJSONObject(i) ?: continue
                val number = entry.optInt("number")
                val state = entry.optString("status")
                addText(
                    "🎟️ ቁጥር፦ $number\n" +
                    "📌 ሁኔታ፦ $state\n" +
                    "🗓️ የተፈጠረበት፦ ${entry.optString("createdAt", "—")}",
                    16,
                    true
                )

                if (state == "reserved") {
                    action("የቁጥር $number ክፍያ አስገባ") {
                        selectedEntry = entry
                        request(
                            "GET",
                            "/draws/${entry.optString("drawId")}"
                        ) { drawCode, drawBody ->
                            if (drawCode == 200) {
                                selectedDraw = drawBody.optJSONObject("draw") ?: JSONObject()
                                showPayment()
                            } else {
                                message("የዕጣ መረጃ መጫን አልተቻለም።")
                            }
                        }
                    }
                }
                addDivider()
            }

            action("ዕጣዎችን ክፈት") { showDraws() }
            action("አድስ") { showMyEntries() }
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
            setPadding(20, 22, 20, 28)
            gravity = Gravity.TOP
        }

        val scroll = ScrollView(this)
        scroll.addView(root)
        setContentView(scroll)

        addText(title, 27, true)
        addText(subtitle, 17, false)

        status = TextView(this).apply {
            textSize = 15f
            setPadding(0, 12, 0, 12)
        }
        root.addView(status)
    }

    private fun addText(
        text: String,
        size: Int = 16,
        bold: Boolean = false
    ) {
        root.addView(TextView(this).apply {
            this.text = text
            textSize = size.toFloat()
            if (bold) setTypeface(null, Typeface.BOLD)
            setPadding(0, 8, 0, 8)
        })
    }

    private fun addDivider() {
        addText("────────────────────────")
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
            isAllCaps = false
            setOnClickListener { run() }
        })
    }

    private fun message(text: String) {
        status.text = text
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }
}
