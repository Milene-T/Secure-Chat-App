from flask import Flask, render_template
from flask_socketio import SocketIO, emit

#Sec key fro flask, unrelated to communication
app = Flask(__name__)
app.config['SECRET_KEY'] = 'super-secret-flask-key'
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/')
def index():
    #Browsers chat interface 
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    print("A gadget connected to the server.")
    #Announce nex connection
    emit('user_joined', broadcast=True, include_self=False)

@socketio.on('public_key_exchange')
def handle_key_exchange(data):
    print("Server relaying public key...")
    #Broadcast to all-emmeteur
    emit('public_key_exchange', data, broadcast=True, include_self=False)

@socketio.on('encrypted_message')
def handle_encrypted_message(data):
    print(f"Server relaying encrypted payload: {data['ciphertext'][:20]}...")
    #Broadcast cryptogramme to all-emmeteur
    emit('encrypted_message', data, broadcast=True, include_self=False)

if __name__ == '__main__':
    print("Starting Blind Relay Server on port 5001...")
    socketio.run(app, host='127.0.0.1', port=5001, debug=True)