# Local Docker resource cleanup ? October 23

Owner requested unnecessary Docker image/container cleanup during editorial work.

Stopped idle containers `gaza-oct23-mysql` and `gaza-oct23-tests`; their volumes and container evidence remain. Active `gaza-oct23-final` MySQL is retained for focused checks. Stopped historical `gaza-b02-recovery-db` remains untouched.

Removed unused reproducible image tags: `gaza-gateway-batch02-rehearsal:php84`, `gaza-gateway-batch02-release:php84`, `gaza-gateway-upgrade-test:php84`, `gaza-gateway-mail-test:php84`, `gaza-gateway-mysql-test:php84`. Kept current `gaza-gateway-batch02-test:php84`, MySQL8.4, PHP8.4 and Composer2 images.

Docker builder prune reported **856 MB reclaimed**. Running containers reduced from three to one. Docker reports 158 volumes (~33.1 GB); ~32.21 GB is unreferenced by current containers, but this does not prove it is disposable. No volumes were removed, no system/volume prune was run and no hosting resources were changed. Image shared layers mean displayed image sizes must not be summed as actual reclaimed bytes.

Final state after focused acceptance: `gaza-oct23-final` was also stopped; **zero Docker containers are running**. All four stopped containers and all158 volumes remain. The task-specific local Vite preview was shut down after screenshots to release its CPU/RAM.
