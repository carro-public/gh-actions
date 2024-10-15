build:
	cd merge-down && npm run build && ncc build -o dist lib/index.js
