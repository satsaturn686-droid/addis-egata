
import { useState } from "react";

const sections = [
  {
    icon: "💰",
    title: "1. በዕጣ ለመሳተፍ Wallet መሙላት",
    content: [
      "በዕጣ ለመሳተፍ በWallet ውስጥ ከዕጣው የመግቢያ ክፍያ ጋር እኩል ወይም ከዚያ በላይ ቀሪ ሂሳብ ሊኖርዎት ይገባል።",
      "Wallet ይክፈቱ፣ Deposit ይምረጡ፣ የሚፈልጉትን መጠንና የTelebirr ግብይት ማረጋገጫ ቁጥር ያስገቡ።",
      "Deposit ጥያቄዎ በአስተዳዳሪ እስኪረጋገጥ ድረስ ገንዘቡ በWallet ሂሳብዎ ላይ ላይጨመር ይችላል። ከተረጋገጠ በኋላ ቀሪ ሂሳብዎን ይፈትሹ።",
    ],
  },
  {
    icon: "🔄",
    title: "2. Deposit / Withdraw እንዴት ይደረጋል?",
    content: [
      "Deposit — Wallet ይክፈቱ፣ Deposit ይምረጡ፣ የሚገባውን የገንዘብ መጠን፣ Transaction Reference እና ካስፈለገ የላኪውን ስም ያስገቡ። ገንዘቡን ከላኩ በኋላ የጥያቄውን ሁኔታ ይከታተሉ።",
      "Withdraw — Wallet ይክፈቱ፣ Withdraw ይምረጡ፣ የሚያወጡትን መጠንና የሚቀበሉበትን Telebirr ቁጥር ያስገቡ። ጥያቄው ከተላከ በኋላ የማስኬጃ ሁኔታውን ይመልከቱ።",
      "የDeposit ወይም Withdraw ጥያቄ መላክ ገንዘቡ ተረጋግጧል ወይም ተልኳል ማለት አይደለም።",
      "የግብይት ማስረጃዎን ይያዙ። ገንዘቡ በተገቢው ጊዜ ካልታየ ተመሳሳይ ክፍያን ደጋግመው ከመላክ ይልቅ ድጋፍ ይጠይቁ።",
    ],
  },
  {
    icon: "🔢",
    title: "3. ስለ ዕጣ ቁጥር አያያዝ",
    content: [
      "መጀመሪያ መሳተፍ የሚፈልጉትን ዕጣ ይምረጡ። የቁጥር ዝርዝሩ የሚታየው ዕጣውን ከመረጡ በኋላ ነው።",
      "ነፃ የሆነ ቁጥር ብቻ ይምረጡ። በሌላ ተሳታፊ የተያዘ ወይም የተከፈለበት ቁጥር ሊመረጥ አይችልም።",
      "ቁጥር ሲይዙ በApp ውስጥ የሚታየውን የReservation ጊዜ ያስተውሉ። የመያዣ ጊዜው ካለፈ ቁጥሩን እንደገና መምረጥ ሊያስፈልግ ይችላል።",
      "ቁጥር መያዝ ብቻውን ክፍያው ተጠናቋል ማለት አይደለም። በApp ውስጥ የክፍያ ሁኔታውን ያረጋግጡ።",
    ],
  },
  {
    icon: "🏆",
    title: "4. የዕጣ አወጣጥና ውጤት ማወቅ",
    content: [
      "የዕጣውን ስም፣ ሽልማት፣ የመግቢያ ክፍያና የተሳትፎ ሁኔታ በApp ውስጥ ይመልከቱ።",
      "የክፍያ ሁኔታዎ ተረጋግጦ መሆኑን ያረጋግጡ። ለጊዜው የተያዘ ቁጥር እና በትክክል የተከፈለ ቁጥር የተለያዩ ናቸው።",
      "ዕጣው ከተወጣ በኋላ Public Results / የውጤት ክፍል ውስጥ የታተመውን ውጤት ይመልከቱ።",
      "አሸናፊ ከሆኑ በApp ውስጥ የሚታየውን የሽልማት መቀበያ መመሪያ ይከተሉ። የገንዘብና የአካላዊ ሽልማት አሰጣጥ ሂደት ሊለያይ ይችላል።",
      "ውጤትዎን በApp ውስጥ ካለው ይፋዊ የውጤት ክፍል ያረጋግጡ። ያልታወቁ ሰዎች በመልዕክት የሚጠይቁትን ተጨማሪ ክፍያ በጥንቃቄ ይመልከቱ።",
    ],
  },
  {
    icon: "🛡️",
    title: "5. የተሳታፊ መብትና ግዴታ",
    content: [
      "መብት፦ ስለ ዕጣው ዋጋ፣ ሽልማት፣ ደንብ፣ የWallet ቀሪ ሂሳብና የውጤት መረጃ ማግኘት።",
      "መብት፦ የክፍያ፣ የቁጥር ወይም የሽልማት ችግር ሲኖር ማብራሪያና ድጋፍ መጠየቅ።",
      "ግዴታ፦ ትክክለኛ መረጃ መስጠት፣ የክፍያ ማስረጃን አለመቀየርና የሌላ ሰውን መለያ ያለፈቃድ አለመጠቀም።",
      "ግዴታ፦ የመለያዎን መግቢያ መረጃ በደህና መጠበቅና የWallet መረጃን ከማያምኑት ሰዎች ጋር አለማጋራት።",
      "ቅሬታ ሲኖር የግብይት ማስረጃ፣ ቀንና የጥያቄውን ሁኔታ ይያዙ፤ በተፈቀደው የድጋፍ መንገድ ያሳውቁ።",
      "የተሳትፎ ብቁነት፣ የገንዘብ ተመላሽና ሌሎች ልዩ ደንቦች በዕጣው ላይ በይፋ በተገለጹት ሁኔታዎችና በሚመለከተው ሕግ መሠረት ይተገበራሉ።",
    ],
  },
];

export default function HelpGuide() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([0]);

  function toggleSection(index: number) {
    setExpanded((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index],
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        style={{
          minHeight: 72,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 6,
          padding: 8,
          border: "1px solid #e3e5e8",
          borderRadius: 15,
          color: "#373b41",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 20 }}>📘</span>
        <small style={{ color: "#777e87", fontSize: 10 }}>
          መመሪያና ህጎች
        </small>
      </button>

      {open && (
        <div
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setOpen(false);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            background: "rgba(4,18,38,0.78)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="addis-help-title"
            style={{
              width: "100%",
              maxWidth: 560,
              maxHeight: "92dvh",
              overflowY: "auto",
              borderRadius: 20,
              background: "#fff",
              color: "#172235",
            }}
          >
            <header
              style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: 18,
                color: "#fff",
                background: "#103b68",
              }}
            >
              <div>
                <p style={{ margin: "0 0 5px", fontSize: 11 }}>
                  ADDIS ዕጣ
                </p>
                <h2
                  id="addis-help-title"
                  style={{ margin: 0, fontSize: 19 }}
                >
                  የአጠቃቀም መመሪያና ህጎች
                </h2>
              </div>
              <button
                type="button"
                aria-label="ዝጋ"
                onClick={() => setOpen(false)}
                style={{
                  width: 40,
                  height: 40,
                  border: "1px solid #7890aa",
                  borderRadius: 10,
                  color: "#fff",
                  background: "transparent",
                  fontSize: 24,
                }}
              >
                ×
              </button>
            </header>

            <div style={{ padding: 14 }}>
              <div
                style={{
                  marginBottom: 14,
                  padding: 13,
                  border: "1px solid #cfe3f7",
                  borderRadius: 12,
                  background: "#edf6ff",
                  color: "#16416c",
                  fontSize: 13,
                  lineHeight: 1.8,
                }}
              >
                ከመሳተፍዎ በፊት መመሪያዎቹን ያንብቡ።
                የWallet እና የቁጥር ሁኔታዎን በApp ውስጥ ያረጋግጡ።
              </div>

              {sections.map((section, index) => {
                const isExpanded = expanded.includes(index);

                return (
                  <section
                    key={section.title}
                    style={{
                      marginBottom: 10,
                      overflow: "hidden",
                      border: "1px solid #e1e7ef",
                      borderRadius: 14,
                    }}
                  >
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleSection(index)}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: 14,
                        border: 0,
                        color: "#153b64",
                        background: isExpanded ? "#f0f6fc" : "#fff",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      <span style={{ fontSize: 21 }}>{section.icon}</span>
                      <strong style={{ flex: 1, fontSize: 13, lineHeight: 1.6 }}>
                        {section.title}
                      </strong>
                      <span>{isExpanded ? "−" : "+"}</span>
                    </button>

                    {isExpanded && (
                      <div
                        style={{
                          display: "grid",
                          gap: 12,
                          padding: "0 14px 15px",
                        }}
                      >
                        {section.content.map((paragraph, paragraphIndex) => (
                          <p
                            key={paragraphIndex}
                            style={{
                              margin: 0,
                              color: "#475467",
                              fontSize: 13,
                              lineHeight: 1.9,
                            }}
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}

              <p
                style={{
                  color: "#6b7280",
                  fontSize: 11,
                  lineHeight: 1.8,
                }}
              >
                ማስታወሻ፦ ይህ የአጠቃቀም መመሪያ ነው።
                ለእያንዳንዱ ዕጣ የታተሙ ይፋዊ ደንቦችንም ይመልከቱ።
              </p>

              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  width: "100%",
                  minHeight: 44,
                  marginTop: 8,
                  padding: 12,
                  border: 0,
                  borderRadius: 12,
                  color: "#fff",
                  background: "#103b68",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                ተረድቻለሁ — ዝጋ
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
