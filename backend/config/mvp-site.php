<?php
return ['enabled' => in_array(env('APP_ENV'), ['local','testing'], true) && (bool)env('MVP_SITE_ENABLED', false)];
