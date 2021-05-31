from dataclasses import dataclass
import os
import functools
from typing import Dict

from flask import Flask, render_template, session, request, send_from_directory, g
from flask.helpers import flash, get_flashed_messages, url_for
from flask.json import jsonify
from sqlalchemy.orm import load_only
from sqlalchemy.sql.expression import values
from werkzeug.utils import redirect
from flask_wtf import FlaskForm
from wtforms import StringField
from wtforms.validators import DataRequired
from flask_sqlalchemy import SQLAlchemy
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY')


def signed_in():
    if 'id' in session:
        users = UserModel.query.filter_by(id=session['id']).all()
        if (len(users) == 1):
            user = users[0]
            if user:
                return user
    return False


def auth(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        g.auth_handled = True
        user = signed_in()
        if user:
            return func(*(list(args) + [user]), **kwargs)
        return redirect(url_for('sign_in_form'))
    return wrapper


def no_auth(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        g.auth_handled = True
        return func(*args, **kwargs)
    return wrapper


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


@dataclass
class CardModel(db.Model):
    __tablename__ = 'cards'

    id: int
    details: Dict
    x: int
    y: int

    id = db.Column(db.Integer, primary_key=True)
    details = db.Column(db.JSON())
    x = db.Column(db.Integer())
    y = db.Column(db.Integer())
    updated_at = db.Column(db.DateTime())


class UserModel(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String)
    encrypted_password = db.Column(db.String)


class HomeForm(FlaskForm):
    pass


@app.get('/status')
@no_auth
def status():
    return {'message': 'OK', 'success': True}


@app.get('/current-user/cards')
@auth
def get_cards(user):
    cards = db.session().query(CardModel).all()
    return jsonify({
        'cards': cards
    })


@app.get('/')
@auth
def root(user):
    form = HomeForm()
    return render_template(
        'home.html.j2',
        username=user.username,
        form=form,
        success=get_flashed_messages(category_filter='success')
    )


if os.getenv('DEV_MODE') == 'true':
    @app.post('/log')
    @auth
    def debug_log(user):
        app.logger.info(
            'from client: ' +
            str(request.json["message"])
        )
        return {'message': 'OK', 'success': True}


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
@no_auth
def sign_in_form():
    form = SignInForm()
    if form.validate_on_submit():
        user = UserModel.query.filter_by(username=form.username.data).first()
        if user and check(user.encrypted_password, form.password.data):
            session['id'] = user.id
            flash('Sign in complete', category='success')
            return redirect(url_for('root'))
    return render_template(
        'sign-in.html.j2',
        username=form.username.data or "",
        form=form
    )


@app.get("/protected/<path:name>")
@auth
def serve_static_protected(user, name):
    return send_from_directory('../static/protected/', name)


@app.get("/<path:name>")
@no_auth
def serve_static_public(name):
    try:
        return send_from_directory('../static/public/', name)
    except Exception as e:
        if signed_in():
            raise e
        return redirect(url_for('sign_in_form'))


def request_log(response):
    app.logger.info(
        request.method +
        ' ' +
        request.url +
        ' ' +
        str(response.status_code)
    )
    return response


def check_auth(response):
    if not getattr(g, 'auth_handled', None):
        raise Exception("No auth set for route", request, response)
    return response


app.after_request(check_auth)
app.after_request(request_log)
