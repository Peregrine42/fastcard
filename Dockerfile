FROM python:3.8-slim
WORKDIR /opt/app
RUN apt update
RUN apt install -y curl

ENV NVM_DIR /usr/local/nvm
RUN curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.1/install.sh | bash
ENV NODE_VERSION v14.17.0
RUN /bin/bash -c "source $NVM_DIR/nvm.sh && nvm install $NODE_VERSION && nvm use --delete-prefix $NODE_VERSION"

ENV NODE_PATH $NVM_DIR/versions/node/$NODE_VERSION/lib/node_modules
ENV PATH      $NVM_DIR/versions/node/$NODE_VERSION/bin:$PATH

ENV VIRTUAL_ENV=/opt/venv
RUN python -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
COPY requirements.txt .
RUN pip install -r requirements.txt

ENTRYPOINT ["bash", "-c", "npm start"]
