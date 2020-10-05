// Play with counting occurrences of module requirements
// by walking latest module versions from module index.
//
// Specifically, this program counts how often blackfriday is required at different
// module paths. This was used in https://github.com/russross/blackfriday/issues/587.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/shurcooL/play/256/moduleproxy"
	"golang.org/x/mod/modfile"
	"golang.org/x/mod/module"
	"golang.org/x/mod/semver"
	"golang.org/x/net/context/ctxhttp"
)

func main() {
	err := run()
	if err != nil {
		log.Fatalln(err)
	}
}

func run() error {
	cl := moduleproxy.Client{
		URL:                url.URL{Scheme: "https", Host: "proxy.golang.org", Path: "/"},
		DisableModuleFetch: true,
	}

	// Determine latest version of each unique module path.
	var (
		latest = make(map[string]string) // Module Path → Module Version.
		total  int
	)
	err := forEachModule(func(m module.Version) error {
		total++
		if semver.Compare(m.Version, latest[m.Path]) == 1 {
			latest[m.Path] = m.Version
		}
		return nil
	})
	if err != nil {
		return err
	}
	fmt.Println("total modules:", total)
	fmt.Println("unique modules:", len(latest))

	// Count modules that require
	// each of these module paths.
	var (
		githubV1 = make(map[module.Version]struct{})
		githubV2 = make(map[module.Version]struct{})
		gopkgV1  = make(map[module.Version]struct{})
		gopkgV2  = make(map[module.Version]struct{})
	)
	for p, v := range latest {
		m := module.Version{Path: p, Version: v}
		b, err := cl.GoMod(context.Background(), m)
		if errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			return err
		}
		f, err := modfile.ParseLax("go.mod", b, nil)
		if el := (modfile.ErrorList)(nil); errors.As(err, &el) {
			log.Println(string(b))
			log.Println("failed to parse go.mod file of module", p+"@"+v)
			log.Println("number of problems is", len(el))
			log.Println(el)
			continue
		} else if err != nil {
			log.Println(string(b))
			return fmt.Errorf("failed to parse go.mod file of module %s: %w", p+"@"+v, err)
		}
		for _, r := range f.Require {
			switch r.Mod.Path {
			case "github.com/russross/blackfriday":
				githubV1[m] = struct{}{}
			case "github.com/russross/blackfriday/v2":
				githubV2[m] = struct{}{}
			case "gopkg.in/russross/blackfriday.v1":
				gopkgV1[m] = struct{}{}
			case "gopkg.in/russross/blackfriday.v2":
				gopkgV2[m] = struct{}{}
			}
		}
	}
	fmt.Println("modules that require github.com/russross/blackfriday (v1):", len(githubV1))
	for m := range githubV1 {
		fmt.Println("\t", m)
	}
	fmt.Println("modules that require github.com/russross/blackfriday/v2:", len(githubV2))
	for m := range githubV2 {
		fmt.Println("\t", m)
	}
	fmt.Println("modules that require gopkg.in/russross/blackfriday.v1:", len(gopkgV1))
	for m := range gopkgV1 {
		fmt.Println("\t", m)
	}
	fmt.Println("modules that require gopkg.in/russross/blackfriday.v2:", len(gopkgV2))
	for m := range gopkgV2 {
		fmt.Println("\t", m)
	}

	return nil
}

func forEachModule(f func(module.Version) error) error {
	var last IndexedModule
	last.Index = time.Now().UTC().Add(-24 * time.Hour)
	//last.Index = time.Date(2020, time.January, 1, 0, 0, 0, 0, time.UTC)
	for {
		log.Println("fetching page since", last.Index)
		mods, err := fetchIndexPage(context.Background(), last.Index)
		if err != nil {
			return fmt.Errorf("failed to fetch an index page: %w", err)
		}
		for i := 0; i < len(mods); i++ {
			if mods[i] == last {
				// Discard modules we've already seen.
				mods = mods[i+1:]
				break
			}
		}
		for _, mod := range mods {
			err := f(mod.Version)
			if err != nil {
				return err
			}
		}
		if len(mods) == 0 {
			break
		}
		// Update the last module we've seen.
		last = mods[len(mods)-1]
	}
	return nil
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
