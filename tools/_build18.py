# -*- coding: utf-8 -*-
import urllib.request, re, json
h = urllib.request.urlopen('https://warbattleuniverse.com/?shot=1&onb=1', timeout=30).read().decode('utf-8', 'replace')
m = re.search(r'<meta name="app-build" content="([^"]+)"', h)
print('build', m.group(1) if m else None)
srcs = re.findall(r'<script[^>]*src="([^"]+)"', h)
for s in srcs:
    if any(k in s for k in ('catalog', 'scene', 'orbit', 'solar', 'motion')):
        print(s)
