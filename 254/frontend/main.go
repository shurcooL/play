package main

import (
	"context"
	"fmt"
	"html"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"syscall/js"
	"time"

	"github.com/shurcooL/play/256/moduleproxy"
	"golang.org/x/mod/module"
	"golang.org/x/net/context/ctxhttp"
)

func main() {
	u, err := url.Parse(js.Global().Get("location").Get("href").String())
	if err != nil {
		log.Fatalln(err)
	}
	mp := moduleproxy.Client{URL: url.URL{Path: "/-/api/proxy/"}}
	switch {
	case strings.HasPrefix(u.Path, "/gomod/"):
		query := u.Path[len("/gomod/"):]
		err := serveGoMod(context.Background(), query, mp)
		if err != nil {
			log.Fatalln(err)
		}
	case strings.HasPrefix(u.Path, "/modgraph/"):
		query := u.Path[len("/modgraph/"):]
		err := serveGraph(context.Background(), query, sleep(u.Query()), mp)
		if err != nil {
			log.Fatalln(err)
		}
	case strings.HasPrefix(u.Path, "/modgraph2/"):
		query := u.Path[len("/modgraph2/"):]
		err := serveGraph2(context.Background(), query, sleep(u.Query()), mp)
		if err != nil {
			log.Fatalln(err)
		}
	case strings.HasPrefix(u.Path, "/modgraph3/"):
		query := u.Path[len("/modgraph3/"):]
		err := serveGraph3(context.Background(), query, sleep(u.Query()), mp)
		if err != nil {
			log.Fatalln(err)
		}
	default:
		js.Global().Get("document").Get("body").Set("innerHTML", "<pre>"+html.EscapeString(`Usage: visit one of these URLs:

• /gomod/<module>@<version> - shows go.mod of specified module
• /modgraph/<module>@<version> - shows a module requirement graph
• /modgraph2/<module>@<version>
• /modgraph3/<module>@<version>

"@<version>" can be left out, then "@latest" is used

the special module "main.localhost" refers to a main module on the local filesystem`)+"</pre>")
	}
}

// parseQuery parses a module query like path@version into a module version.
// If a version is not specified, "latest" is used.
func parseQuery(query string) module.Version {
	if i := strings.Index(query, "@"); i != -1 {
		return module.Version{Path: query[:i], Version: query[i+1:]}
	}
	return module.Version{Path: query, Version: "latest"}
}

func sleep(v url.Values) time.Duration {
	seconds, _ := strconv.Atoi(v.Get("sleep"))
	return time.Duration(seconds) * time.Second
}

func renderGraph(ctx context.Context, g io.Reader) ([]byte, error) {
	resp, err := ctxhttp.Post(ctx, nil, "/-/api/dot", "", g)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("non-200 OK status code: %v body: %q", resp.Status, body)
	}
	b, err := ioutil.ReadAll(resp.Body)
	return b, err
}
