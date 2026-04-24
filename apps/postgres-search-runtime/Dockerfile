FROM postgres:18-bookworm AS builder

ARG PGVECTOR_REF=v0.8.1
ARG SCWS_VERSION=1.2.3
ARG ZHPARSER_REF=v2.3
ARG RUM_REF=1.3.15

RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  ca-certificates \
  curl \
  git \
  libltdl-dev \
  postgresql-server-dev-18 \
  wget \
&& rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN git clone --branch "${PGVECTOR_REF}" --depth 1 https://github.com/pgvector/pgvector.git \
&& make -C /build/pgvector \
&& make -C /build/pgvector install

RUN wget -O /build/scws.tar.bz2 "http://www.xunsearch.com/scws/down/scws-${SCWS_VERSION}.tar.bz2" \
&& tar -xjf /build/scws.tar.bz2 -C /build \
&& cd "/build/scws-${SCWS_VERSION}" \
&& ./configure \
&& make \
&& make install

RUN git clone --branch "${ZHPARSER_REF}" --depth 1 https://github.com/amutu/zhparser.git \
&& make -C /build/zhparser \
&& make -C /build/zhparser install

RUN git clone --branch "${RUM_REF}" --depth 1 https://github.com/postgrespro/rum.git \
&& make -C /build/rum USE_PGXS=1 \
&& make -C /build/rum USE_PGXS=1 install

FROM postgres:18-bookworm

COPY --from=builder /usr/lib/postgresql /usr/lib/postgresql
COPY --from=builder /usr/share/postgresql /usr/share/postgresql
COPY --from=builder /usr/local /usr/local
COPY healthcheck/search-runtime.sql /usr/local/share/search-runtime/healthcheck/search-runtime.sql

ENV LD_LIBRARY_PATH="/usr/local/lib"

HEALTHCHECK --interval=10s --timeout=5s --retries=10 CMD bash -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /usr/local/share/search-runtime/healthcheck/search-runtime.sql'
