# MeTube RU (metube-ru)

Русскоязычный форк [alexta69/metube](https://github.com/alexta69/metube) с дополнительными возможностями:

- встроенная страница авторизации в приложении (без Nginx Basic Auth);
- глобальный прокси для загрузок (`SOCKS5`, `HTTP`, `HTTPS`) через UI;
- русифицированный интерфейс.

Базовый движок загрузок: `yt-dlp`.

## Что изменено относительно upstream

- Добавлена backend-аутентификация с сессионной cookie:
  - `GET /auth/status`
  - `POST /auth/login`
  - `POST /auth/logout`
- Добавлена глобальная настройка прокси:
  - `GET /proxy-config`
  - `POST /proxy-config`
- Добавлен UI-вход (логин/пароль) и UI-блок настройки прокси.
- Интерфейс переведен на русский.

## Быстрый старт (Docker Compose)

1. Клонируйте репозиторий:

```bash
git clone https://github.com/alexkuryshko/metube-ru.git
cd metube-ru
```

2. Создайте директорию загрузок:

```bash
mkdir -p downloads
```

3. Проверьте `docker-compose.yml` (пример ниже) и задайте свой логин/пароль.

4. Запустите:

```bash
docker compose up -d
```

5. Откройте:

```text
http://<your-host>:8081
```

## Пример docker-compose.yml

```yaml
services:
  metube:
    image: ghcr.io/alexta69/metube:latest
    container_name: metube
    restart: unless-stopped
    ports:
      - "8081:8081"
    environment:
      - AUTH_ENABLED=true
      - AUTH_USERNAME=admin
      - AUTH_PASSWORD=change-me
      - AUTH_SESSION_TTL_SECONDS=86400
      - CHOWN_DIRS=false
    volumes:
      - ./downloads:/downloads
      # Собранный RU UI (если используете доработанный фронтенд)
      - ./ui/dist/metube/browser:/app/ui/dist/metube/browser:ro
      # Переопределенный backend (если используете доработанный backend)
      - ./app/main.py:/app/app/main.py:ro
```

## Встроенная авторизация

Авторизация включается переменной:

- `AUTH_ENABLED=true`

Параметры:

- `AUTH_USERNAME` — логин;
- `AUTH_PASSWORD` — пароль;
- `AUTH_SESSION_TTL_SECONDS` — TTL сессии в секундах (минимум 300).

Поведение:

- без сессии защищенные API возвращают `401`;
- UI показывает страницу входа;
- после входа открывается основной интерфейс.

## Глобальный прокси (SOCKS5/HTTP/HTTPS)

В разделе **Глобальный прокси** в UI можно задать:

- тип: `SOCKS5`, `HTTP`, `HTTPS`;
- host/port;
- username/password (опционально).

Настройка применяется глобально для загрузок через `yt-dlp` как параметр `proxy`.
Состояние прокси сохраняется в `STATE_DIR` (по умолчанию в `downloads/.metube`).

## Reverse proxy (Nginx)

Если публикуете наружу, рекомендуется HTTPS + reverse proxy.

Пример:

```nginx
server {
    listen 80;
    server_name mt.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name mt.example.com;

    ssl_certificate /etc/letsencrypt/live/mt.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mt.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Обновление

```bash
git pull
docker compose pull
docker compose up -d
```

Если меняли UI/бекенд в этом форке и используете volume-монтирование, пересоберите фронтенд:

```bash
docker run --rm -v "$PWD/ui:/ui" -w /ui node:lts-alpine sh -lc "corepack enable && pnpm install && pnpm run build"
docker compose restart metube
```

## Безопасность

- Обязательно меняйте `AUTH_PASSWORD` с дефолтного.
- Используйте HTTPS при внешнем доступе.
- Не публикуйте `.env`, дампы и runtime-данные в git.

## Лицензия

См. [LICENSE](./LICENSE) (AGPL-3.0), как и в оригинальном проекте.
