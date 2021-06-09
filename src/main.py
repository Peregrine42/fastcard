from dataclasses import dataclass
import os
import functools
from typing import Dict
import random
from functools import partial

from flask import Flask, render_template, session, request, send_from_directory, g
from flask.helpers import flash, get_flashed_messages, url_for
from flask.json import jsonify
from sqlalchemy.sql.expression import or_
from sqlalchemy.sql.functions import now
from sqlalchemy.orm.attributes import flag_modified
from werkzeug.utils import redirect
from flask_wtf import FlaskForm
from flask_wtf.csrf import CSRFProtect
from wtforms import StringField
from wtforms.validators import DataRequired
from flask_sqlalchemy import SQLAlchemy
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from flask_socketio import SocketIO

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY')

csrf = CSRFProtect()
csrf.init_app(app)

if os.getenv("DEV_MODE"):
    random.seed(100)


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


class UserModel(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String)
    encrypted_password = db.Column(db.String)


@dataclass
class CardModel(db.Model):
    __tablename__ = 'cards'

    id: int
    details: Dict
    x: int
    y: int
    url: str

    id = db.Column(db.Integer, primary_key=True)
    details = db.Column(db.JSON())
    x = db.Column(db.Integer())
    y = db.Column(db.Integer())
    front = db.Column(db.Text())
    back = db.Column(db.Text())
    url = db.Column(db.Text())
    updated_at = db.Column(db.DateTime())
    owner = db.Column(db.ForeignKey(UserModel.id))


class HomeForm(FlaskForm):
    pass


@app.get('/status')
@no_auth
def status():
    return {'message': 'OK', 'success': True}


@app.get('/current-user/cards')
@auth
def get_cards(user):
    return jsonify({
        'cards': query_cards(user),
    })


def getId(cardUpdate):
    return cardUpdate["id"]


def query_cards(user, ids=None):
    if ids is None:
        result = db.session().query(CardModel).filter(or_(CardModel.owner == None, CardModel.owner == user.id)).order_by(CardModel.id).all()
    else:
        result = db.session().query(CardModel).filter(CardModel.id.in_(ids)).filter(or_(CardModel.owner == None, CardModel.owner == user.id)).order_by(CardModel.id).all()
    return result


def flip_card(c):
    c.details["facing"] = not c.details["facing"]
    if c.details["facing"]:
        c.url = c.front
    else:
        c.url = c.back
    flag_modified(c, "details")


def set_z(z, c):
    c.details["z"] = z
    flag_modified(c, "details")


def clone_card(c, change_func):
    new_card = CardModel(
        details={
            "facing": c.details["facing"],
            "rotation": c.details["rotation"],
            "name": c.details["name"],
            "z": c.details["z"]
        },
        x=c.x,
        y=c.y,
        front=c.front,
        back=c.back,
        url=c.url,
        updated_at=now(),
        owner=c.owner,
    )
    change_func(new_card)

    db.session().add(new_card)
    db.session().delete(c)


@app.post('/current-user/cards')
@auth
def update_cards(user):
    card_updates = sorted(request.json.get("cardUpdates", []), key=getId)
    card_ids = [p["id"] for p in card_updates]

    grabbed_ids = sorted(request.json.get("cardGrabs", []))
    dropped_ids = sorted(request.json.get("cardDrops", []))
    flipped_ids = sorted(request.json.get("cardFlips", []))
    shuffled_ids = sorted(request.json.get("cardShuffles", []))

    updated_cards = query_cards(user, card_ids)
    grabbed_cards = query_cards(user, grabbed_ids)
    dropped_cards = query_cards(user, dropped_ids)
    flipped_cards = query_cards(user, flipped_ids)
    shuffled_cards = query_cards(user, shuffled_ids)

    if (
        len(updated_cards) or
        len(grabbed_cards) or
        len(dropped_cards) or
        len(flipped_cards) or
        len(shuffled_cards)
    ):
        if len(shuffled_cards):
            zs = [c.details["z"] for c in shuffled_cards]
            random.shuffle(zs)
            for i, c in enumerate(shuffled_cards):
                if c.owner is None or c.owner == user.id:
                    clone_card(c, partial(set_z, zs[i]))
        for c in grabbed_cards:
            if c.owner is None:
                c.owner = user.id

        for c in dropped_cards:
            if c.owner == user.id:
                c.owner = None

        for c in flipped_cards:
            if c.owner is None or c.owner == user.id:
                clone_card(c, flip_card)

        done_card_updates = []
        for i, c in enumerate(updated_cards):
            p = card_updates[i]
            updated = False
            if c.owner is None or c.owner == user.id:
                if p.get("x", None) is not None and p.get("y", None) is not None:
                    c.x = p["x"]
                    c.y = p["y"]
                    updated = True
                    done_card_updates.append({
                        "id": c.id,
                        "x": c.x,
                        "y": c.y,
                    })
                if p.get("details", None) is not None:
                    details = p["details"]
                    if details.get("rotation", None) is not None:
                        c.details["rotation"] = details["rotation"]
                        flag_modified(c, "details")
                        updated = True
                    if details.get("facing", None) is not None:
                        c.details["facing"] = details["facing"]
                        flag_modified(c, "details")
                        updated = True
                    if details.get("z", None) is not None:
                        c.details["z"] = details["z"]
                        flag_modified(c, "details")
                        updated = True
                        done_card_updates.append({
                            "id": c.id,
                            "z": c.details["z"]
                        })

            if updated:
                c.updated_at = now()
        db.session().commit()

        if len(done_card_updates):
            print(done_card_updates)
            socketio.emit('cardUpdate', {'fromUserId': user.id, 'cardUpdates': done_card_updates})

    return jsonify({
        'success': True
    })


@app.get('/')
@auth
def root(user):
    form = HomeForm()
    return render_template(
        'home.html.j2',
        username=user.username,
        user_id=user.id,
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
        form=form,
        success=get_flashed_messages(category_filter='success')
    )


@app.post("/sign-out")
@auth
def sign_out(payload):
    session['id'] = None
    return redirect(url_for('root'))


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


app.after_request(request_log)

socketio = SocketIO(app)

if __name__ == '__main__':
    if os.getenv("DEV_MODE"):
        host = "0.0.0.0"
    else:
        host = "localhost"
    socketio.run(app, host=host, port=8080)
