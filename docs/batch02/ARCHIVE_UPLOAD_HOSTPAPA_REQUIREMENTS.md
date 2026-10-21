# Archive upload request-size requirements

The application preserves binary limits of 10 MiB/file, five files and 25 MiB/submission. Multipart is the public UI transport. The supported JSON fallback carries base64; 25 MiB encodes to approximately 33.34 MiB, plus a few padding bytes per file and bounded metadata. A 25 MiB HTTP body cap would incorrectly reject valid JSON submissions.

Required bounded configuration for the next separately authorized release:

| Layer | Required value |
|---|---|
| PHP web SAPI `file_uploads` | On |
| PHP web SAPI `upload_max_filesize` | `10M` |
| PHP web SAPI `post_max_size` | `40M` (41,943,040 bytes) |
| PHP web SAPI `max_file_uploads` | At least 5 |
| PHP web SAPI `memory_limit` | At least `256M`, finite and compatible with the account limit |
| Apache/equivalent request-body cap | 41,943,040 bytes on the API upload entry point |

Application-level raw limits remain authoritative even if hosting permits larger files. Laravel's existing global `ValidatePostSize` middleware checks Content-Length against PHP post_max_size before TrimStrings/JSON input traversal. The web-server cap is also necessary for chunked requests and to bound parsing before PHP/application validation. Never use an unlimited body cap as a workaround.

PHP supports post_max_size and upload_max_filesize as per-directory settings; CGI/FastCGI can use `.user.ini` or cPanel's PHP INI editor. Apache LimitRequestBody supports directory/.htaccess context when the host permits its override. Confirm the actual handler and allowed override first; do not insert unsupported directives blindly. Examples for the authorized operator to apply to the real web entry point:

```ini
upload_max_filesize = 10M
post_max_size = 40M
max_file_uploads = 5
memory_limit = 256M
```

```apache
LimitRequestBody 41943040
```

Verify effective values through the real web SAPI in the reviewed private capability preflight, not CLI php -i (which can use a different INI). Verify that Apache or its actual replacement enforces the body cap; request HostPapa's equivalent if overrides are unavailable. Keep diagnostic output private, with no phpinfo page, credentials or data changes. Include the settings and their effective read-only evidence in the next exact-source release manifest/preflight. Existing runtime canary already reads upload_max_filesize/post_max_size; this PR does not alter that operator lane.

Status: supported PHP/Apache mechanisms verified against official documentation and source middleware inspected; **effective production values and HostPapa override permission are not certified in this source-only correction**. This remains a release preflight gate. No hosting configuration was changed.

Sources: [PHP core directives](https://www.php.net/manual/en/ini.core.php), [PHP per-directory INI support](https://www.php.net/manual/en/configuration.file.per-user.php), [Apache LimitRequestBody](https://httpd.apache.org/docs/2.4/mod/core.html#limitrequestbody).
