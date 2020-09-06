// Play with a live Go module index viewer.
//
// View a published version at https://dmitri.shuralyov.com/projects/live-module-index/.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"time"

	"golang.org/x/mod/module"
	"golang.org/x/net/context/ctxhttp"
	"honnef.co/go/js/dom/v2"
)

func main() {
	document := dom.GetWindow().Document().(dom.HTMLDocument)
	document.Body().SetInnerHTML("")

	h1 := document.CreateElement("h1").(*dom.HTMLHeadingElement)
	h1.SetInnerHTML(`real-time <a href="https://index.golang.org">Go Module Index</a> feed... (newest on top)`)
	h1.Style().SetProperty("font-size", "1.5em", "")
	document.Body().AppendChild(h1)

	out := document.CreateElement("pre").(*dom.HTMLPreElement)
	document.Body().AppendChild(out)

	footer := document.CreateElement("footer").(*dom.BasicHTMLElement)
	footer.SetInnerHTML(`<a href="https://github.com/shurcooL/play/tree/master/282">source code</a>`)
	document.Body().AppendChild(footer)

	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	var last IndexedModule
	last.Index = time.Now().UTC().Add(-5 * time.Minute)
	for {
		mods, err := fetchIndexPage(context.Background(), last.Index)
		if err != nil {
			log.Println("failed to fetch an index page:", err)
			time.Sleep(10 * time.Second)
			continue
		}
		for i := 0; i < len(mods); i++ {
			if mods[i] == last {
				// Discard modules we've already seen.
				mods = mods[i+1:]
				break
			}
		}
		for _, mod := range mods {
			out.SetTextContent(fmt.Sprintln(mod) + out.TextContent())
		}
		if len(mods) > 0 {
			// Update the last module we've seen.
			last = mods[len(mods)-1]
		}
		<-ticker.C
	}
}

type IndexedModule struct {
	module.Version
	Index time.Time
}

// fetchIndexPage fetches a single page of results from the Go Module
// Index, with t as the the oldest allowable index time. Zero t means
// to start at the beginning of the index.
func fetchIndexPage(ctx context.Context, t time.Time) ([]IndexedModule, error) {
	var q = make(url.Values)
	if !t.IsZero() {
		q.Set("since", t.Format(time.RFC3339Nano))
	}
	url := (&url.URL{Scheme: "https", Host: "index.golang.org", Path: "/index", RawQuery: q.Encode()}).String()
	resp, err := ctxhttp.Get(ctx, nil, url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("non-200 OK status code: %v body: %q", resp.Status, body)
	}
	var mods []IndexedModule
	for dec := json.NewDecoder(resp.Body); ; {
		var v struct {
			module.Version
			Index time.Time `json:"Timestamp"`
		}
		err := dec.Decode(&v)
		if err == io.EOF {
			break
		} else if err != nil {
			return nil, err
		}
		mods = append(mods, IndexedModule(v))
	}
	return mods, nil
}
