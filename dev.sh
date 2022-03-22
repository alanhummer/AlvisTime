#!/usr/bin/env -S bash -eux

# Start an HTTP server for development
python -m http.server --directory ./interface/ --bind 0.0.0.0 8080
