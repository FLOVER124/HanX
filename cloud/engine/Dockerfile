# HanX engine container for the cloud MCP service (Cloudflare Containers, linux/amd64).
FROM ubuntu:22.04

ARG HANX_VERSION=2.13.4
ARG HANX_SHA256=59f5186a2d373b9c8b0729db9540a64753d439a9c7e4824439a81a360e914864

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ca-certificates curl \
 && curl -fsSL -o /tmp/hanx.tar.gz "https://github.com/FLOVER124/HanX/releases/download/v${HANX_VERSION}/HanX-CLI-${HANX_VERSION}-linux-x64.tar.gz" \
 && echo "${HANX_SHA256}  /tmp/hanx.tar.gz" | sha256sum -c - \
 && mkdir -p /opt/hanx && tar -xzf /tmp/hanx.tar.gz -C /opt/hanx \
 && rm /tmp/hanx.tar.gz \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin hanx \
 && /opt/hanx/hanx --version

COPY server.py /srv/server.py

USER hanx
ENV HANX_BIN=/opt/hanx/hanx PORT=8080
EXPOSE 8080
CMD ["python3", "/srv/server.py"]
