package main

import (
	"context"
	"log"
	"net/url"
	"strings"
	"syscall/js"

	"github.com/shurcooL/play/256/moduleproxy"
	"golang.org/x/mod/module"
	"golang.org/x/net/html"
)

func main() {
	u, err := url.Parse(js.Global().Get("location").Get("href").String())
	if err != nil {
		log.Fatalln(err)
	}
	mp := moduleproxy.Client{url.URL{Path: "/-/api/proxy/"}}
	switch {
	case strings.HasPrefix(u.Path, "/godoc/"):
		query := u.Path[len("/godoc/"):]
		err := serveGodoc(context.Background(), query, mp)
		if err != nil {
			log.Fatalln(err)
		}
	default:
		js.Global().Get("document").Get("body").Set("innerHTML", "<pre>"+html.EscapeString(`Usage: visit one of these URLs:

• /godoc/<module>@<version>/<package> - view godoc of specified package

for packages at module root, "@<version>" can be left out, then "@latest" is used`)+"</pre>")
	}
}

// parseQuery parses a package query like "module@version/package"
// into a module version and package path.
// If a version is not specified, "latest" is used.
func parseQuery(query string) (module.Version, string) {
	// Split "a@b/c" into "a" and "b/c".
	i := strings.Index(query, "@")
	if i == -1 {
		return module.Version{Path: query, Version: "latest"}, "."
	}
	modPath, versionPackage := query[:i], query[i+1:]

	// Split "b/c" into "b" and "c".
	i = strings.Index(versionPackage, "/")
	if i == -1 {
		return module.Version{Path: modPath, Version: versionPackage}, "."
	}
	version, pkgPath := versionPackage[:i], versionPackage[i+1:]

	return module.Version{Path: modPath, Version: version}, pkgPath
}
