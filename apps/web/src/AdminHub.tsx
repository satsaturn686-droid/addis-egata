import {
  useState,
} from "react";

import AdminDashboard from "./AdminDashboard";
import AdminDrawCreate from "./AdminDrawCreate";
import AdminDrawManage from "./AdminDrawManage";
import AdminPaymentSettings from "./AdminPaymentSettings";

type AdminSection =
  | "payments"
  | "create-draw"
  | "draw-manage"
  | "payment-settings";

export default function AdminHub() {
  const [section, setSection] =
    useState<AdminSection>("payments");

  return (
    <main className="admin-hub">
      <style>
        {`
          .admin-hub {
            min-height: 100%;
            background: #0b0f14;
            color: #f4f7fb;
          }

          .admin-hub-nav {
            width: 100%;
            max-width: 760px;
            margin: 0 auto;
            padding: 14px 16px 0;
            box-sizing: border-box;
          }

          .admin-hub-brand {
            margin-bottom: 12px;
          }

          .admin-hub-brand strong {
            display: block;
            font-size: 18px;
            line-height: 1.3;
          }

          .admin-hub-brand span {
            display: block;
            margin-top: 3px;
            color: #7f8b98;
            font-size: 12px;
          }

          .admin-hub-tabs {
            display: grid;
            grid-template-columns:
              repeat(4, minmax(0, 1fr));
            gap: 8px;
          }

          .admin-hub-tab {
            min-height: 44px;
            border: 1px solid #293442;
            border-radius: 10px;
            background: #111720;
            color: #aeb9c5;
            font: inherit;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
          }

          .admin-hub-tab.active {
            border-color: #dbe3ed;
            background: #e7edf5;
            color: #0b0f14;
          }

          .admin-hub-tab:focus-visible {
            outline: 2px solid #8aa2ff;
            outline-offset: 2px;
          }

          @media (max-width: 760px) {
            .admin-hub-tabs {
              grid-template-columns:
                repeat(2, minmax(0, 1fr));
            }
          }

          @media (max-width: 560px) {
            .admin-hub-nav {
              padding-left: 12px;
              padding-right: 12px;
            }

            .admin-hub-tabs {
              grid-template-columns: 1fr;
            }
          }
        `}
      </style>

      <nav
        className="admin-hub-nav"
        aria-label="Admin navigation"
      >
        <div className="admin-hub-brand">
          <strong>
            Addis ዕጣ Admin
          </strong>

          <span>
            የዕጣ እና ክፍያ አስተዳደር
          </span>
        </div>

        <div className="admin-hub-tabs">
          <button
            type="button"
            className={
              section === "payments"
                ? "admin-hub-tab active"
                : "admin-hub-tab"
            }
            onClick={() =>
              setSection("payments")
            }
          >
            የክፍያ ማረጋገጫ
          </button>

          <button
            type="button"
            className={
              section === "create-draw"
                ? "admin-hub-tab active"
                : "admin-hub-tab"
            }
            onClick={() =>
              setSection("create-draw")
            }
          >
            አዲስ ዕጣ ፍጠር
          </button>

          <button
            type="button"
            className={
              section === "draw-manage"
                ? "admin-hub-tab active"
                : "admin-hub-tab"
            }
            onClick={() =>
              setSection("draw-manage")
            }
          >
            ዕጣ አስተዳደር
          </button>

          <button
            type="button"
            className={
              section === "payment-settings"
                ? "admin-hub-tab active"
                : "admin-hub-tab"
            }
            onClick={() =>
              setSection("payment-settings")
            }
          >
            Telebirr ቁጥር
          </button>
        </div>
      </nav>

      {section === "payments" ? (
        <AdminDashboard
          onBack={() =>
            setSection("draw-manage")
          }
        />
      ) : section === "create-draw" ? (
        <AdminDrawCreate
          onCreated={() =>
            setSection("draw-manage")
          }
        />
      ) : section === "draw-manage" ? (
        <AdminDrawManage />
      ) : (
        <AdminPaymentSettings />
      )}
    </main>
  );
}
