import os
from flask import Flask, render_template, session, request, send_from_directory
from flask.helpers import flash, get_flashed_messages, url_for
from werkzeug.utils import redirect
from flask_wtf import FlaskForm
from wtforms import StringField
from wtforms.validators import DataRequired
from flask_sqlalchemy import SQLAlchemy
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY')


def build_db_url():
    username = os.getenv('DATABASE_USERNAME')
    password = os.getenv('DATABASE_PASSWORD')
    host = os.getenv('DATABASE_HOST')
    port = os.getenv('DATABASE_PORT')
    name = os.getenv('DATABASE_NAME')
    return (
        'postgresql://' + username + ':' +
        password + '@' +
        host + ':' + port
        + '/' +
        name
    )


app.config['SQLALCHEMY_DATABASE_URI'] = build_db_url()
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)


class CardModel(db.Model):
    __tablename__ = 'cards'

    id = db.Column(db.Integer, primary_key=True)
    details = db.Column(db.JSON())
    x = db.Column(db.Integer())
    y = db.Column(db.Integer())
    updated_at = db.Column(db.DateTime())

    def __init__(self, details={}, x=0, y=0):
        self.details = details
        self.x = x
        self.y = y

    def __repr__(self):
        return f"<Card {self.x} {self.y}>"


class UserModel(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String)
    encrypted_password = db.Column(db.String)

    def __init__(self, username, encrypted_password):
        self.username = username
        self.encrypted_password = encrypted_password

    def __repr__(self):
        return f"<User {self.username}>"


class HomeForm(FlaskForm):
    pass


@app.get('/status')
def status():
    return {'message': 'OK', 'success': True}


@app.route('/')
def root():
    if 'id' in session and session['id'] == '5':
        form = HomeForm()
        return render_template(
            'home.html.j2',
            username='',
            form=form,
            success=get_flashed_messages(category_filter='success')
        )
    return redirect(url_for('sign_in_form'))


class SignInForm(FlaskForm):
    username = StringField('username', validators=[DataRequired()])
    password = StringField('password', validators=[DataRequired()])


def check(hash, incoming_password):
    try:
        return PasswordHasher().verify(hash, incoming_password)
    except VerifyMismatchError:
        pass
    return False


@app.route("/sign-in", methods=['GET', 'POST'])
def sign_in_form():
    form = SignInForm()
    if form.validate_on_submit():
        user = UserModel.query.filter_by(username=form.username.data).first()
        if user and check(user.encrypted_password, form.password.data):
            session['id'] = '5'
            flash('Sign in complete', category='success')
            return redirect(url_for('root'))
    return render_template(
        'sign-in.html.j2',
        username=form.username.data or "",
        form=form
    )


@app.get("/<path:name>")
def serve_static(name):
    print(name)
    return send_from_directory('../static/public/', name)


def request_log(response):
    app.logger.info(
        request.method +
        ' ' +
        request.url +
        ' ' +
        str(response.status_code)
    )
    return response


app.after_request(request_log)
