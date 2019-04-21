package module

import (
	"context"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"

	"github.com/rogpeppe/go-internal/module"
	"golang.org/x/net/context/ctxhttp"
)

type Proxy struct {
	URL url.URL
}

// GoMod fetches the go.mod file for the given module version.
// It returns os.ErrNotExist if it doesn't exist.
func (p Proxy) GoMod(ctx context.Context, mod module.Version) ([]byte, error) {
	return p.fetch(ctx, mod, "mod")
}

// Zip fetches the .zip file for the given module version.
// It returns os.ErrNotExist if it doesn't exist.
func (p Proxy) Zip(ctx context.Context, mod module.Version) ([]byte, error) {
	return p.fetch(ctx, mod, "zip")
}

func (p Proxy) fetch(ctx context.Context, mod module.Version, suffix string) ([]byte, error) {
	enc, err := module.EncodePath(mod.Path)
	if err != nil {
		return nil, err
	}
	encVer, err := module.EncodeVersion(mod.Version)
	if err != nil {
		return nil, err
	}
	u := url.URL{Path: enc + "/@v/" + encVer + "." + suffix}
	resp, err := ctxhttp.Get(ctx, nil, p.URL.ResolveReference(&u).String())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, os.ErrNotExist
	} else if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("non-200 OK status code: %v body: %q", resp.Status, body)
	}
	return ioutil.ReadAll(resp.Body)
}

func (p Proxy) ServeHTTP(w http.ResponseWriter, req *http.Request) error {
	originURL := p.URL.ResolveReference(&url.URL{Path: req.URL.Path}).String()
	resp, err := ctxhttp.Get(req.Context(), nil, originURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return os.ErrNotExist
	} else if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return fmt.Errorf("non-200 OK status code: %v body: %q", resp.Status, body)
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, err = io.Copy(w, resp.Body)
	return err
}
