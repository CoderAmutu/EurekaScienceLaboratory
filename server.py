from flask import Flask, request, send_from_directory, jsonify, make_response
import secrets
import time

app = Flask(__name__)

STATIC_FOLDER = 'C:/Users/User/Desktop/H5測試'
tokens = {}  # 存儲有效的 Token 和生成時間


# 靜態文件服務
@app.route('/<path:filename>', methods=['GET'])
def serve_file(filename):
    return send_from_directory(STATIC_FOLDER, filename)


# 金鑰驗證並生成一次性 Token
@app.route('/get-token', methods=['GET', 'POST'])
def generate_token():
    # 調試輸出請求信息
    print("Request Method:", request.method)
    print("Request Headers:", request.headers)
    print("Request Form Data:", request.form)

    if request.method == 'GET':
        return jsonify({"message": "Use POST method with authKey"}), 405

    auth_key = request.form.get('authKey', '').strip()
    if auth_key == "gasyuberu":  # 檢查金鑰
        # 清理過期 Token
        current_time = time.time()
        global tokens
        tokens = {t: ts for t, ts in tokens.items() if current_time -
                  ts < 300}  # 保留有效期內的 Token

        # 生成新 Token
        token = secrets.token_urlsafe(16).strip()
        tokens[token] = current_time  # 存儲生成時間
        print("Generated Token:", token)
        return jsonify({"token": token}), 200
    else:
        print("Invalid authKey received.")
        return jsonify({"message": "Invalid Key"}), 403


# 驗證 Token 是否有效
@app.route('/validate-token', methods=['GET'])
def validate_token():
    token = request.args.get('token', '').strip()
    current_time = time.time()
    creation_time = tokens.get(token)

    print("Token received for validation:", token)

    # 驗證 Token 是否有效且未過期
    if creation_time and current_time - creation_time < 300:  # 5 分鐘有效期
        print("Token is valid.")
        return jsonify({"message": "Token Valid"}), 200
    else:
        # 如果 Token 過期或無效，刪除它
        tokens.pop(token, None)
        print("Token is invalid or expired.")
        return jsonify({"message": "Invalid or Expired Token"}), 403


# 啟動伺服器
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
