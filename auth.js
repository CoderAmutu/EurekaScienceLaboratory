// auth.js
// 使用 module 需標記 <script type="module">

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getDatabase, ref, onValue, get } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";


// Firebase Config 佔位符會由後端動態注入
const firebaseConfig = {
    apiKey: "__FIREBASE_API_KEY__",
    authDomain: "eurekasciencelaboratory.firebaseapp.com",
    databaseURL: "https://eurekasciencelaboratory-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "eurekasciencelaboratory",
    storageBucket: "eurekasciencelaboratory.appspot.com",
    messagingSenderId: "881933165589",
    appId: "1:881933165589:web:f7dcd2a93489a9bb2cda1c",
    measurementId: "G-3KXN92S88D"
};

// 初始化 Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// 等待 DOM 完全載入再執行授權流程
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const uid = urlParams.get("uid");
    const token = urlParams.get("token");
    console.log("🔍 window.location.search =", window.location.search);
    console.log("🔍 parsed uid           =", uid);
    console.log("🔍 parsed token         =", token);

    if (!uid || !token) {
        unauthorizedAccess("param_missing");
    }

    const validateUrl = `/validate-token?uid=${uid}&token=${token}`;
    console.log("🔍 calling validate-url =", validateUrl);

    fetch(validateUrl, { method: "GET" })
        .then(res => {
            console.log('HTTP status:', res.status);
            if (!res.ok) throw new Error("Token 驗證失敗");
            return res.json();
        })
        .then(() => {
            console.log("✅ Token 驗證成功，準備登入 Firebase...");
            const fbToken = urlParams.get("fb");
            if (!fbToken) {
                throw new Error("缺少 Firebase Custom Token");
            }
            return signInWithCustomToken(auth, fbToken);
        })
        .then(() => {
            console.log("✅ Firebase 登入成功，啟動 session 監聽");
            startSessionMonitor(uid);
        })
        .catch(err => {
            console.error("Token 錯誤或過期", err);
            unauthorizedAccess("auth_failed");
        });
});

function unauthorizedAccess(type = "default") {
    const scenes = {
        session_kick: `
      <h2 style="color: #FF0000; margin-bottom: 15px;">⚠️ 帳號異常使用警告 ⚠️</h2>
      <p>🧬 系統偵測到此帳號已於其他裝置進入實驗室</p>
      <p>為維護實驗室的秩序與安全，本視窗已被自動關閉 🛑</p>
      <p>🔄 若您本人操作，請關閉其他視窗後重新進入</p>
      <p>讓我們一同維護穩定的研究環境 🔬</p>
    `,
        auth_failed: `
      <h2 style="color: #FF0000; margin-bottom: 15px;">⚠️ 授權失敗 ⚠️</h2>
      <p>🔒 系統無法確認您的身份，您尚未獲得進入許可</p>
      <p>🚫 請確認您是透過尤里卡實驗室入口進入</p>
      <p>✨ 安全的研究環境需要嚴謹的授權流程</p>
      <p>讓我們再次從實驗室入口出發，一同探索科學的奧秘 🔍</p>
    `,
        param_missing: `
      <h2 style="color: #FF0000; margin-bottom: 15px;">⚠️ 連線異常 ⚠️</h2>
      <p>📡 系統偵測到您的連線資訊不完整（缺少身份參數）</p>
      <p>🧭 請不要直接開啟此頁面，務必從官方應用程式啟動</p>
      <p>這樣我們才能準確帶您進入正確的研究空間 🔬</p>
      <p>從入口重新出發，將為您開啟安全之門 🚪</p>
    `,
        default: `
      <h2 style="color: #FF0000; margin-bottom: 15px;">⚠️ 尤里卡實驗室入侵警告 ⚠️</h2>
      <p>🌐 系統偵測到您可能意外的進入了實驗室的神秘領域 🌐</p>
      <p>從神秘領域出現可能會讓勤奮研究的夥伴們感到不安 😨</p>
      <p>📥 請立即回到正確的尤里卡實驗室入口</p>
      <p>讓我們繼續共同探索科學的奧秘吧！</p>
    `
    };

    document.title = "尤里卡實驗室警告畫面";
    document.body.innerHTML = `
    <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background-color: #fff; padding: 20px; border-radius: 10px;
                box-shadow: 0 0 10px rgba(0,0,0,0.5); font-family: Arial, sans-serif;
                text-align: center;">
      ${scenes[type] || scenes.default}
      <button onclick="window.close()" style="margin-top: 15px; padding: 10px 20px; border: none;
              background-color: #007BFF; color: #fff; border-radius: 5px; cursor: pointer;">
        離開系統
      </button>
    </div>
  `;
}


function startSessionMonitor(uid) {
    console.log("執行 startSessionMonitor(uid)，收到 uid =", uid);
    const db = getDatabase(app);
    const sessionRef = ref(db, `/authorizedUsers/${uid}/sessionId`);

    let currentSessionId = null;
    let initialized = false;

    onValue(sessionRef, (snapshot) => {
        const latest = snapshot.val();
        const latestStr = (latest ?? "").toString(); // 防 null、轉字串
        const currentStr = (currentSessionId ?? "").toString();

        if (!initialized) {
            currentSessionId = latestStr;
            console.log("✅ 初始化 sessionId =", currentSessionId);
            initialized = true;
            return;
        }

        console.log(
            "🔍 即時監聽比對 sessionId：current =",
            currentStr,
            "| latest =",
            latestStr
        );

        if (latestStr !== currentStr) {
            console.warn("sessionId 改變（on 觸發），觸發踢出");
            unauthorizedAccess("session_kick");
        }
    });
    // ✅ fallback 輪詢機制（每 5 秒主動取一次）
    setInterval(() => {
        if (!initialized) return;

        get(sessionRef).then((snapshot) => {
            const latest = snapshot.val();
            const latestStr = (latest ?? "").toString();
            const currentStr = (currentSessionId ?? "").toString();

            console.log(
                "比對 sessionId：current =",
                currentStr,
                "| latest =",
                latestStr
            );

            if (latestStr !== currentStr) {
                console.warn("sessionId 改變（輪詢發現），觸發踢出");
                unauthorizedAccess("session_kick");
            }
        });
    }, 5000); // 每 5 秒一次
    // ✅ 新增：回到頁面時比對一次 sessionId
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") {
            console.log("回到前景頁面，強制比對 sessionId");

            get(sessionRef).then((snapshot) => {
                const latestStr = (snapshot.val() ?? "").toString();
                const currentStr = (currentSessionId ?? "").toString();

                console.log(
                    "回前台比對 sessionId：current =",
                    currentStr,
                    "| latest =",
                    latestStr
                );

                if (initialized && latestStr !== currentStr) {
                    console.warn("回到畫面發現 sessionId 已變，踢出");
                    unauthorizedAccess("session_kick");
                }
            });
        }
    });
    //點擊
    document.addEventListener("click", function () {
        if (!initialized) return;

        console.log("🖱️ 使用者點擊畫面，強制比對 sessionId");

        get(sessionRef).then((snapshot) => {
            const latestStr = (snapshot.val() ?? "").toString();
            const currentStr = (currentSessionId ?? "").toString();

            console.log(
                "🔁 點擊後比對 sessionId：current =",
                currentStr,
                "| latest =",
                latestStr
            );

            if (latestStr !== currentStr) {
                console.warn("🛑 點擊發現 sessionId 已變，踢出");
                unauthorizedAccess("session_kick");
            }
        });
    });
}