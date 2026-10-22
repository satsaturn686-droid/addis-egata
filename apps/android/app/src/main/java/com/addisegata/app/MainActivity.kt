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

    private val green = android.graphics.Color.rgb(13, 71, 48)
    private val greenLight = android.graphics.Color.rgb(22, 101, 52)
    private val pageColor = android.graphics.Color.rgb(246, 248, 251)
    private val textColor = android.graphics.Color.rgb(31, 41, 55)
    private val mutedColor = android.graphics.Color.rgb(100, 116, 139)
    private val borderColor = android.graphics.Color.rgb(220, 226, 232)
    private val white = android.graphics.Color.WHITE

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        token = prefs.getString("token", "") ?: ""

        if (token.isNotBlank()) {
            request("GET", "/app-auth/me", auth = true) { code, _ ->
                if (code == 200) {
                    showDraws()
                } else {
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
                connection =
                    (URL(api + path).openConnection() as HttpURLConnection).apply {
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
                    ).use {
                        it.write(data.toString())
                    }
                }

                code = connection.responseCode

                val stream = if (code in 200..399) {
                    connection.inputStream
                } else {
                    connection.errorStream
                }

                val body = stream
                    ?.bufferedReader()
                    ?.use { it.readText() } ?: "{}"

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

            runOnUiThread {
                done(code, result)
            }
        }
    }

    private fun showLogin() {
        screen("ADDIS ዕጣ", "እድልህን ዲጂታል አድርግ")
        addText("ወደ መለያዎ ይግቡ", 21, true)
        addText("ዕጣዎችን ለማየትና ለመሳተፍ መለያዎን ይጠቀሙ።")

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

        action("አዲስ መለያ ፍጠር") {
            showRegister()
        }
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

        action("ወደ መግቢያ ተመለስ") {
            showLogin()
        }
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

            val draws = body.optJSONArray("draws") ?: JSONArray()

            if (draws.length() == 0) {
                addText("በአሁኑ ጊዜ የሚገኝ ዕጣ የለም።", 18, true)
            }

            for (i in 0 until draws.length()) {
                val draw = draws.optJSONObject(i) ?: continue
                val name = draw.optString("name", "ዕጣ")
                val prize = draw.optString("prizeName", "—")
                val description = draw.optString("prizeDescription", "")
                val fee = draw.opt("entryFee")?.toString() ?: "—"
                val total = draw.optInt("totalNumbers", 0)
                val filled = draw.optInt("filledNumbers", 0)
                val remaining = (total - filled).coerceAtLeast(0)

                val card = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(18, 16, 18, 16)
                    background = rounded(white, borderColor, 20f)
                    isClickable = true
                    isFocusable = true
                    setOnClickListener { openDraw(draw) }
                }

                card.addView(TextView(this).apply {
                    text = "🎟️ $name"
                    textSize = 21f
                    setTypeface(null, Typeface.BOLD)
                    setTextColor(green)
                    setPadding(0, 0, 0, 10)
                })

                card.addView(TextView(this).apply {
                    text = "🏆 ሽልማት፦ $prize"
                    textSize = 17f
                    setTypeface(null, Typeface.BOLD)
                    setTextColor(textColor)
                    setPadding(0, 4, 0, 6)
                })

                if (description.isNotBlank() && description != "null") {
                    card.addView(TextView(this).apply {
                        text = "📝 $description"
                        textSize = 15f
                        setTextColor(mutedColor)
                        setPadding(0, 4, 0, 8)
                    })
                }

                card.addView(TextView(this).apply {
                    text = "💰 የመግቢያ ክፍያ፦ $fee ETB"
                    textSize = 16f
                    setTypeface(null, Typeface.BOLD)
                    setTextColor(green)
                    setPadding(0, 6, 0, 6)
                })

                card.addView(TextView(this).apply {
                    text = "🔢 የቁጥር ብዛት፦ $total"
                    textSize = 15f
                    setTextColor(textColor)
                    setPadding(0, 4, 0, 4)
                })

                card.addView(TextView(this).apply {
                    text = "✅ የተያዙ፦ $filled     🟢 የቀሩ፦ $remaining"
                    textSize = 15f
                    setTextColor(textColor)
                    setPadding(0, 4, 0, 4)
                })

                card.addView(TextView(this).apply {
                    text = "ዕጣውን ለመክፈት እዚህ ይንኩ  →"
                    textSize = 15f
                    setTypeface(null, Typeface.BOLD)
                    setTextColor(greenLight)
                    setPadding(0, 8, 0, 0)
                })

                root.addView(card, LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = 14 })
            }

            action("💰 ዋሌት") { showWallet() }
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
            addText("💰 ክፍያ፦ ${selectedDraw.opt("entryFee")} ETB", 17, true)
            addText("🔢 የቁጥር ብዛት፦ ${selectedDraw.optInt("totalNumbers")}")
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
                addText("የሽልማት ዝርዝር", 19, true)
                for (i in 0 until prizes.length()) {
                    val prize = prizes.optJSONObject(i) ?: continue
                    addText("${prize.optInt("rank")}ኛ ቦታ፦ ${prize.opt("amount")} ETB")
                }
            }

            val total = selectedDraw.optInt("totalNumbers", 0)
            val occupied = selectedDraw.optJSONArray("occupiedNumbers") ?: JSONArray()
            val taken = HashSet<Int>()

            for (i in 0 until occupied.length()) {
                taken.add(occupied.optInt(i))
            }

            addDivider()
            addText("ቁጥር ይምረጡ", 20, true)
            addText("የተያዙ ቁጥሮች መመረጥ አይችሉም።")

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

                    val numberButton = Button(this).apply {
                        text = number.toString()
                        isAllCaps = false
                        textSize = 16f
                        setTypeface(null, Typeface.BOLD)
                        val isOpen = selectedDraw.optString("status") == "open"
                        isEnabled = number !in taken && isOpen

                        backgroundTintList =
                            android.content.res.ColorStateList.valueOf(
                                if (number in taken) {
                                    android.graphics.Color.rgb(180, 185, 190)
                                } else {
                                    android.graphics.Color.rgb(22, 101, 52)
                                }
                            )

                        setTextColor(android.graphics.Color.WHITE)
                        minimumWidth = 0
                        minWidth = 0
                        minHeight = 52
                        setPadding(0, 0, 0, 0)
                    }

                    numberButton.setOnClickListener {
                        selectedNumber = number
                        message("ቁጥር $number መርጠዋል።")

                        for (j in 0 until grid.childCount) {
                            val line = grid.getChildAt(j) as? LinearLayout ?: continue
                            for (k in 0 until line.childCount) {
                                val button = line.getChildAt(k) as? Button ?: continue
                                val n = button.text.toString().toIntOrNull()
                                if (n == number) {
                                    button.backgroundTintList =
                                        android.content.res.ColorStateList.valueOf(green)
                                } else if (n != null && n !in taken) {
                                    button.backgroundTintList =
                                        android.content.res.ColorStateList.valueOf(greenLight)
                                }
                            }
                        }
                    }

                    row?.addView(
                        numberButton,
                        LinearLayout.LayoutParams(0, 52, 1f).apply {
                            setMargins(3, 3, 3, 3)
                        }
                    )
                }
            }

            action("የመረጥኩትን ቁጥር ያዝ") { reserveSelectedNumber() }
            action("የእኔ ቁጥሮች") { showMyEntries() }
            action("ወደ ዕጣዎች ተመለስ") { showDraws() }
        }
    }

    private fun reserveSelectedNumber() {
        if (selectedNumber < 1) {
            message("በመጀመሪያ ቁጥር ይምረጡ።")
            return
        }

        message("ቁጥር $selectedNumber እየተያዘ ነው…")

        request(
            "POST",
            "/entries/reserve",
            JSONObject()
                .put("drawId", selectedDraw.optString("id"))
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
        screen("ADDIS ዕጣ", "💰 ከWallet ክፈል")

        val entryId = selectedEntry.optString("id")
        val number = selectedEntry.optInt("number", selectedNumber)
        val fee = selectedDraw.opt("entryFee")?.toString() ?: "—"

        addText("🎟️ ${selectedDraw.optString("name")}", 19, true)
        addText("🔢 የመረጡት ቁጥር፦ $number")
        addText("💰 የሚከፈለው፦ $fee ETB", 18, true)
        addText("ከWallet ለመክፈል ከታች ያለውን ቁልፍ ይጫኑ።")

        request("GET", "/payments/wallet", auth = true) { code, body ->
            val wallet = body.optJSONObject("wallet")
            status.text = if (code == 200 && wallet != null) {
                "💰 ቀሪ ሂሳብ፦ ${"%.2f".format(wallet.optDouble("balance", 0.0))} ETB"
            } else {
                body.optString("message", "Wallet መጫን አልተቻለም።")
            }
        }

        action("💰 ከWallet ክፈል") {
            if (entryId.isBlank()) {
                message("የቁጥሩ መለያ አልተገኘም። ቁጥሩን እንደገና ይምረጡ።")
                return@action
            }

            message("ክፍያው እየተፈጸመ ነው…")

            request(
                "POST",
                "/payments/wallet/purchase",
                JSONObject().put("entryId", entryId),
                true
            ) { code, body ->
                if (code == 200) {
                    val result = body.optJSONObject("result") ?: JSONObject()

                    screen("ADDIS ዕጣ", "✅ ክፍያ ተሳክቷል")
                    addText("🎟️ ዕጣ፦ ${selectedDraw.optString("name")}")
                    addText("🔢 ቁጥር፦ $number", 19, true)
                    addText("💸 የተቀነሰው፦ $fee ETB")
                    addText(
                        "💰 አዲስ ቀሪ ሂሳብ፦ ${
                            "%.2f".format(result.optDouble("balance", 0.0))
                        } ETB",
                        18,
                        true
                    )
                    addText("ቁጥርዎ ተከፍሏል። የዕጣውን ውጤት ይጠብቁ።")

                    action("💰 Wallet ክፈት") { showWallet() }
                    action("🎟️ የእኔ ቁጥሮች") { showMyEntries() }
                    action("ወደ ዕጣዎች ተመለስ") { showDraws() }
                } else {
                    val error = body.optString("error", "")
                    val errorMessage = when (error) {
                        "INSUFFICIENT_WALLET_BALANCE" ->
                            "የWallet ቀሪ ሂሳብ በቂ አይደለም። Wallet ይሙሉ።"
                        "RESERVATION_EXPIRED" ->
                            "የቁጥር መያዣው ጊዜ አልፏል። ቁጥሩን እንደገና ይምረጡ።"
                        "NUMBER_UNAVAILABLE" ->
                            "ይህ ቁጥር ከዚህ በፊት ተይዟል። ሌላ ቁጥር ይምረጡ።"
                        else ->
                            body.optString("message", "ክፍያው አልተሳካም።")
                    }

                    message(errorMessage)

                    if (error == "INSUFFICIENT_WALLET_BALANCE") {
                        action("➕ Wallet ሙላ") { showWallet() }
                    }

                    action("እንደገና ሞክር") { showPayment() }
                    action("ወደ ዕጣዎች ተመለስ") { showDraws() }
                }
            }
        }

        action("ወደ Wallet ሂድ") { showWallet() }
        action("ወደ ዕጣዎች ተመለስ") { openDraw(selectedDraw) }
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
                addText("እስካሁን የያዙት ቁጥር የለም።", 18, true)
            }

            for (i in 0 until entries.length()) {
                val entry = entries.optJSONObject(i) ?: continue
                val number = entry.optInt("number")
                val state = entry.optString("status")

                addText(
                    "🎟️ ቁጥር፦ $number\n📌 ሁኔታ፦ $state\n🗓️ የተፈጠረበት፦ ${entry.optString("createdAt", "—")}",
                    16,
                    true
                )

                if (state == "reserved") {
                    action("የቁጥር $number ክፍያ አስገባ") {
                        selectedEntry = entry
                        request("GET", "/draws/${entry.optString("drawId")}") { drawCode, drawBody ->
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

    private fun showWallet() {
        screen("ADDIS ዕጣ", "💰 ዋሌት")
        addServiceHoursNotice()
        message("ዋሌት እየተጫነ ነው…")

        request("GET", "/payments/wallet", auth = true) { code, body ->
            if (code != 200) {
                message(body.optString("message", "ዋሌትን መጫን አልተቻለም።"))
                action("እንደገና ሞክር") { showWallet() }
                action("ወደ ዕጣዎች ተመለስ") { showDraws() }
                return@request
            }

            val wallet = body.optJSONObject("wallet") ?: JSONObject()
            val balance = wallet.optDouble("balance", 0.0)
            status.text = ""

            val balanceCard = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(22, 22, 22, 22)
                background = rounded(green, green, 22f)
            }

            balanceCard.addView(TextView(this).apply {
                text = "የአሁኑ ቀሪ ሂሳብ"
                textSize = 16f
                setTextColor(android.graphics.Color.rgb(220, 245, 230))
            })

            balanceCard.addView(TextView(this).apply {
                text = "%.2f ETB".format(balance)
                textSize = 30f
                setTypeface(null, Typeface.BOLD)
                setTextColor(white)
                setPadding(0, 8, 0, 0)
            })

            root.addView(balanceCard, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = 18 })

            addText("ገንዘብ ለመጨመር ወይም ለማውጣት ከታች ይምረጡ።")
            action("➕ በTelebirr ገንዘብ ጨምር") { showWalletDeposit() }
            action("➖ ወደ Telebirr ገንዘብ አውጣ") { showWalletWithdraw(balance) }
            action("📋 የWallet ታሪክ") { showWalletHistory() }
            action("🔄 ቀሪ ሂሳብ አድስ") { showWallet() }
            action("ወደ ዕጣዎች ተመለስ") { showDraws() }
        }
    }

    private fun addServiceHoursNotice() {
        val targetRoot = root

        val notice = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16, 14, 16, 14)
            background = rounded(
                android.graphics.Color.rgb(255, 251, 235),
                android.graphics.Color.rgb(245, 205, 120),
                18f
            )
        }

        notice.addView(TextView(this).apply {
            text = "🕒 የDeposit እና Withdraw አገልግሎት ሰዓት"
            textSize = 16f
            setTypeface(null, Typeface.BOLD)
            setTextColor(android.graphics.Color.rgb(120, 75, 10))
        })

        val details = TextView(this).apply {
            text = "የአገልግሎት ሰዓቱ እየተጫነ ነው…"
            textSize = 14f
            setTextColor(textColor)
            setPadding(0, 8, 0, 0)
        }

        notice.addView(details)
        targetRoot.addView(notice, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = 14 })

        request("GET", "/payments/settings", auth = true) { code, body ->
            if (root !== targetRoot) return@request

            if (code != 200) {
                details.text =
                    "Deposit እና Withdraw የሚገኙት በአገልግሎት ሰዓት ብቻ ነው።"
                return@request
            }

            val settings = body.optJSONObject("settings") ?: JSONObject()
            val enabled = settings.optBoolean("serviceEnabled", true)
            val openTime = settings.optString("serviceOpenTime", "03:00")
            val closeTime = settings.optString("serviceCloseTime", "12:00")
            val localTime = settings.optString("localTime", "")
            val isOpen = settings.optBoolean("isOpen", false)
            val range = "${displayTime(openTime)} – ${displayTime(closeTime)}"

            details.text = when {
                !enabled ->
                    "አገልግሎቱ ለጊዜው ተዘግቷል።\nየሰዓት ቀጠና፦ የኢትዮጵያ ሰዓት"

                isOpen ->
                    "የሚሰራበት ሰዓት፦ $range\n" +
                    "ሁኔታ፦ አሁን ክፍት ነው ✅\n" +
                    "የአሁኑ ሰዓት፦ ${displayTime(localTime)} (የኢትዮጵያ ሰዓት)"

                else ->
                    "የሚሰራበት ሰዓት፦ $range\n" +
                    "ሁኔታ፦ አሁን ዝግ ነው 🔒\n" +
                    "እባክዎ በአገልግሎት ሰዓት ይሞክሩ።\n" +
                    "የሰዓት ቀጠና፦ የኢትዮጵያ ሰዓት"
            }
        }
    }

    private fun displayTime(value: String): String {
        val parts = value.split(":")
        if (parts.size < 2) return value

        val hour = parts[0].toIntOrNull() ?: return value
        val minute = parts[1].toIntOrNull() ?: return value
        val suffix = if (hour < 12) "AM" else "PM"
        val hour12 = if (hour % 12 == 0) 12 else hour % 12

        return "%02d:%02d %s".format(hour12, minute, suffix)
    }

    private fun showWalletDeposit() {
        screen("ADDIS ዕጣ", "➕ በTelebirr ገንዘብ ጨምር")
        addServiceHoursNotice()

        addText(
            "ገንዘብ ወደ Telebirr ቁጥሩ ከላኩ በኋላ " +
            "የግብይት ማረጋገጫውን ያስገቡ።"
        )

        val amount = field("የሚጨመረው ገንዘብ (ETB)")
        amount.inputType = 8194
        val reference = field("የTelebirr Transaction Reference")
        val sender = field("የላኪው ሙሉ ስም (አማራጭ)")
        val targetRoot = root

        request("GET", "/payments/settings", auth = true) { code, body ->
            if (root !== targetRoot) return@request

            val number = if (code == 200) {
                body.optJSONObject("settings")?.optString("telebirrNumber", "") ?: ""
            } else {
                ""
            }

            status.text = if (number.isNotBlank()) {
                "📱 የTelebirr ቁጥር፦ $number"
            } else {
                "የTelebirr ቁጥር አልተገኘም። ከአስተዳደሩ ያረጋግጡ።"
            }
        }

        action("📋 የTelebirr ቁጥር ቅዳ") {
            request("GET", "/payments/settings", auth = true) { code, body ->
                val number = if (code == 200) {
                    body.optJSONObject("settings")?.optString("telebirrNumber", "") ?: ""
                } else {
                    ""
                }

                if (number.isBlank()) {
                    message("የTelebirr ቁጥር አልተገኘም።")
                } else {
                    val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText("Telebirr", number))
                    message("የTelebirr ቁጥሩ ተቀድቷል።")
                }
            }
        }

        action("የDeposit ጥያቄ ላክ") {
            val value = amount.text.toString().trim().toDoubleOrNull()
            val ref = reference.text.toString().trim()
            val name = sender.text.toString().trim()

            if (value == null || value <= 0 || ref.isBlank()) {
                message("ትክክለኛ የገንዘብ መጠንና Transaction Reference ያስገቡ።")
                return@action
            }

            if (ref.length > 200 || name.length > 200) {
                message("ያስገቡት መረጃ ከሚፈቀደው ርዝመት በላይ ነው።")
                return@action
            }

            val payload = JSONObject()
                .put("amount", value)
                .put("transactionReference", ref)

            if (name.isNotBlank()) payload.put("senderName", name)

            message("የDeposit ጥያቄው እየተላከ ነው…")

            request(
                "POST",
                "/payments/wallet/deposit/telebirr",
                payload,
                true
            ) { resultCode, result ->
                if (resultCode == 201) {
                    screen("ADDIS ዕጣ", "የDeposit ጥያቄ")
                    addText("✅ የDeposit ጥያቄዎ ተልኳል።", 20, true)
                    addText("መጠን፦ %.2f ETB".format(value))
                    addText("Reference፦ $ref")
                    addText("አስተዳደሩ እስኪያረጋግጥ ጥያቄው በመጠባበቅ ላይ ይቆያል።")
                    action("ወደ Wallet ተመለስ") { showWallet() }
                } else {
                    message(result.optString("message", "የDeposit ጥያቄው አልተሳካም።"))
                }
            }
        }

        action("ወደ Wallet ተመለስ") { showWallet() }
    }

    private fun showWalletWithdraw(balance: Double) {
        screen("ADDIS ዕጣ", "➖ ገንዘብ አውጣ")
        addServiceHoursNotice()

        addText("ያለዎት ቀሪ ሂሳብ፦ %.2f ETB".format(balance), 20, true)
        addText("የሚፈልጉትን መጠንና ገንዘቡ የሚላክበትን የTelebirr ቁጥር ያስገቡ።")

        val amount = field("የሚወጣው ገንዘብ (ETB)")
        amount.inputType = 8194
        val number = field("የእርስዎ Telebirr ቁጥር")
        number.inputType = 3

        action("የWithdrawal ጥያቄ ላክ") {
            val value = amount.text.toString().trim().toDoubleOrNull()
            val phone = number.text.toString().trim()

            if (value == null || value <= 0 || phone.isBlank()) {
                message("ትክክለኛ የገንዘብ መጠንና የTelebirr ቁጥር ያስገቡ።")
                return@action
            }

            if (value > balance) {
                message("የገንዘቡ መጠን ካለዎት ቀሪ ሂሳብ በላይ ነው።")
                return@action
            }

            if (phone.length > 30) {
                message("ያስገቡት የTelebirr ቁጥር አልተቀበለም።")
                return@action
            }

            val payload = JSONObject()
                .put("amount", value)
                .put("telebirrNumber", phone)

            message("የWithdrawal ጥያቄው እየተላከ ነው…")

            request("POST", "/payments/wallet/withdraw", payload, true) { code, body ->
                if (code == 201) {
                    screen("ADDIS ዕጣ", "የWithdrawal ጥያቄ")
                    addText("✅ የWithdrawal ጥያቄዎ ተልኳል።", 20, true)
                    addText("መጠን፦ %.2f ETB".format(value))
                    addText("የTelebirr ቁጥር፦ $phone")
                    addText("አስተዳደሩ እስኪያስተናግድ ይጠብቁ።")
                    action("ወደ Wallet ተመለስ") { showWallet() }
                } else {
                    message(body.optString("message", "የWithdrawal ጥያቄው አልተሳካም።"))
                }
            }
        }

        action("ወደ Wallet ተመለስ") { showWallet() }
    }

    private fun showWalletHistory() {
        screen("ADDIS ዕጣ", "📋 የWallet ታሪክ")
        message("የWallet ታሪክ እየተጫነ ነው…")

        request("GET", "/payments/wallet/history", auth = true) { code, body ->
            if (code != 200) {
                message(body.optString("message", "የWallet ታሪክን መጫን አልተቻለም።"))
                action("እንደገና ሞክር") { showWalletHistory() }
                action("ወደ Wallet ተመለስ") { showWallet() }
                return@request
            }

            status.text = ""
            val history = body.optJSONObject("history") ?: JSONObject()
            val transactions = history.optJSONArray("transactions") ?: JSONArray()
            val deposits = history.optJSONArray("deposits") ?: JSONArray()
            val withdrawals = history.optJSONArray("withdrawals") ?: JSONArray()

            addText("የገንዘብ እንቅስቃሴ", 19, true)

            if (transactions.length() == 0) {
                addText("እስካሁን የገንዘብ እንቅስቃሴ የለም።")
            }

            for (i in 0 until transactions.length()) {
                val item = transactions.optJSONObject(i) ?: continue
                addText(
                    "${item.optString("type")} • ${item.optDouble("amount", 0.0)} ETB\n" +
                    "${item.optString("description", "")}\n" +
                    "ቀሪ ሂሳብ፦ ${item.optDouble("balanceAfter", 0.0)} ETB\n" +
                    item.optString("createdAt", "")
                )
                addDivider()
            }

            addText("የDeposit ጥያቄዎች", 19, true)
            if (deposits.length() == 0) addText("የDeposit ጥያቄ የለም።")

            for (i in 0 until deposits.length()) {
                val item = deposits.optJSONObject(i) ?: continue
                addText(
                    "መጠን፦ ${item.optDouble("amount", 0.0)} ETB\n" +
                    "ሁኔታ፦ ${item.optString("status")}\n" +
                    "Reference፦ ${item.optString("transactionReference", "")}\n" +
                    item.optString("createdAt", "")
                )
                addDivider()
            }

            addText("የWithdrawal ጥያቄዎች", 19, true)
            if (withdrawals.length() == 0) addText("የWithdrawal ጥያቄ የለም።")

            for (i in 0 until withdrawals.length()) {
                val item = withdrawals.optJSONObject(i) ?: continue
                addText(
                    "መጠን፦ ${item.optDouble("amount", 0.0)} ETB\n" +
                    "ሁኔታ፦ ${item.optString("status")}\n" +
                    "Telebirr፦ ${item.optString("telebirrNumber", "")}\n" +
                    item.optString("createdAt", "")
                )
                addDivider()
            }

            action("ታሪኩን አድስ") { showWalletHistory() }
            action("ወደ Wallet ተመለስ") { showWallet() }
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
            setPadding(20, 20, 20, 28)
            gravity = Gravity.TOP
            setBackgroundColor(pageColor)
        }

        val scroll = ScrollView(this).apply {
            setFillViewport(true)
            clipToPadding = false
        }

        scroll.addView(root)
        setContentView(scroll)

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(22, 22, 22, 22)
            background = rounded(green, green, 22f)
        }

        root.addView(header, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = 14 })

        header.addView(TextView(this).apply {
            text = title
            textSize = 28f
            setTypeface(null, Typeface.BOLD)
            setTextColor(white)
            setPadding(0, 0, 0, 8)
        })

        header.addView(TextView(this).apply {
            text = subtitle
            textSize = 17f
            setTextColor(android.graphics.Color.rgb(225, 245, 234))
        })

        status = TextView(this).apply {
            textSize = 15f
            setTextColor(textColor)
            setPadding(4, 10, 4, 12)
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
            setTextColor(textColor)
            if (bold) setTypeface(null, Typeface.BOLD)
            setPadding(4, 9, 4, 9)
        })
    }

    private fun addDivider() {
        root.addView(android.view.View(this).apply {
            setBackgroundColor(borderColor)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                1
            ).apply {
                topMargin = 7
                bottomMargin = 7
            }
        })
    }

    private fun field(hintText: String): EditText {
        val input = EditText(this).apply {
            hint = hintText
            textSize = 16f
            setSingleLine(true)
            setTextColor(textColor)
            setHintTextColor(mutedColor)
            setPadding(15, 10, 15, 10)
            background = rounded(white, borderColor, 14f)
        }

        root.addView(input, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = 12 })

        return input
    }

    private fun action(label: String, run: () -> Unit) {
        root.addView(Button(this).apply {
            text = label
            isAllCaps = false
            textSize = 16f
            setTypeface(null, Typeface.BOLD)
            setTextColor(white)
            minHeight = 52
            backgroundTintList =
                android.content.res.ColorStateList.valueOf(greenLight)
            setPadding(16, 10, 16, 10)
            setOnClickListener { run() }
        }, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = 5
            bottomMargin = 7
        })
    }

    private fun message(text: String) {
        status.text = text
    }

    private fun rounded(
        color: Int,
        strokeColor: Int,
        radius: Float
    ): android.graphics.drawable.GradientDrawable {
        return android.graphics.drawable.GradientDrawable().apply {
            setColor(color)
            setStroke(1, strokeColor)
            cornerRadius = radius
        }
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }
}
