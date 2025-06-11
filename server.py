from flask import Flask, request, send_from_directory, jsonify
import secrets
import time
import os

app = Flask(__name__)

# 靜態檔案所在資料夾
STATIC_FOLDER = os.path.join(os.getcwd())

# tokens dict 會存 token → (生成時間, 綁定的 uid)
tokens = {}

# 根路徑服務首頁


@app.route('/')
def home():
    return send_from_directory(STATIC_FOLDER, 'index.html')

# 靜態資源服務（如 index.html 以外的檔案）


@app.route('/<path:filename>', methods=['GET'])
def serve_file(filename):
    return send_from_directory(STATIC_FOLDER, filename)

# Unity 端呼叫，用來產生一次性 Token


@app.route('/get-token', methods=['POST'])
def generate_token():
    auth_key = request.form.get('authKey', '').strip()
    uid = request.form.get('uid', '').strip()  # 拿到 Unity 傳來的 UID

    # 驗證金鑰與 UID
    if auth_key == "gasyuberu" and uid:
        current_time = time.time()
        global tokens
        # 清理超過 5 分鐘的舊 token
        tokens = {
            t: (ts, u)
            for t, (ts, u) in tokens.items()
            if current_time - ts < 300
        }

        # 產生新的 token，並綁定到 UID
        token = secrets.token_urlsafe(16).strip()
        tokens[token] = (current_time, uid)
        print(f"Generated Token for UID {uid}: {token}")
        return jsonify({"token": token}), 200
    else:
        print("Invalid authKey or missing UID:", auth_key, uid)
        return jsonify({"message": "Invalid Key or missing UID"}), 403

# H5 端載入後呼叫，用來驗證一次性 Token 並立刻作廢


@app.route('/validate-token', methods=['GET'])
def validate_token():
    token = request.args.get('token', '').strip()
    uid = request.args.get('uid', '').strip()
    current_time = time.time()

    entry = tokens.get(token)
    print("Token validation request:", token, "for UID:", uid)

    if entry:
        creation_time, associated_uid = entry
        # 驗證：1) 5 分鐘內；2) UID 必須一致
        if current_time - creation_time < 300 and associated_uid == uid:
            # 成功即刪除，使其一次性失效
            tokens.pop(token, None)
            print(f"Token valid and deleted for UID {uid}: {token}")
            return jsonify({"message": "Token Valid"}), 200

    # 驗證失敗或過期，都刪除 token 防止重複使用
    tokens.pop(token, None)
    print("Token invalid, expired, or UID mismatch:", token, uid)
    return jsonify({"message": "Invalid or Expired Token"}), 403


if __name__ == '__main__':
    # 啟動 Flask 伺服器
    app.run(host='0.0.0.0', port=8080)
