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
        return blockAccess("缺少必要參數 uid 或 token");
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
            blockAccess("授權失敗，請從官方應用程式開啟");
        });
});

function blockAccess(message) {
    document.body.innerHTML = `
			<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:black;color:white;font-size:1.8em;text-align:center;padding:2em;">
				 ${message}<br><br>請從 Unity 應用程式啟動本頁
			</div>`;
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
            blockAccess("此帳號已於其他裝置開啟，本視窗已失效");
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
                blockAccess("此帳號已於其他裝置開啟，本視窗已失效");
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
                    blockAccess("此帳號已於其他裝置開啟，本視窗已失效");
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
                blockAccess("此帳號已於其他裝置開啟，本視窗已失效");
            }
        });
    });
}