// Package moduleproxy provides a Go module proxy client and server.
package moduleproxy

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"net/url"
	"os"
	"path"
	"time"

	"golang.org/x/mod/module"
	"golang.org/x/net/context/ctxhttp"
)

// Info describes a module version.
type Info struct {
	Version string    // version string
	Time    time.Time // commit time
}

// Client is a low-level module proxy client that targets the proxy at URL.
type Client struct {
	URL url.URL

	// DisableModuleFetch controls whether to set the
	// non-standard Disable-Module-Fetch: true header.
	DisableModuleFetch bool
}

// List fetches the list of versions for the given module.
// It returns os.ErrNotExist if it doesn't exist.
func (c Client) List(ctx context.Context, modulePath string) ([]string, error) {
	enc, err := escapePath(modulePath)
	if err != nil {
		return nil, err
	}
	resp, err := ctxhttp.Get(ctx, nil, urlJoinPath(c.URL, enc+"/@v/list"))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
		return nil, os.ErrNotExist
	} else if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("non-200 OK status code: %v body: %q", resp.Status, body)
	}
	s := bufio.NewScanner(resp.Body)
	var list []string
	for s.Scan() {
		list = append(list, s.Text())
	}
	return list, s.Err()
}

// Info fetches the .info file for the given module version.
// It returns os.ErrNotExist if it doesn't exist.
func (c Client) Info(ctx context.Context, mod module.Version) (Info, error) {
	b, err := c.fetchFile(ctx, mod, "info")
	if err != nil {
		return Info{}, err
	}
	var info Info
	err = json.Unmarshal(b, &info)
	return info, err
}

// GoMod fetches the go.mod file for the given module version.
// It returns os.ErrNotExist if it doesn't exist.
func (c Client) GoMod(ctx context.Context, mod module.Version) ([]byte, error) {
	return c.fetchFile(ctx, mod, "mod")
}

// Zip fetches the .zip file for the given module version.
// It returns os.ErrNotExist if it doesn't exist.
func (c Client) Zip(ctx context.Context, mod module.Version) ([]byte, error) {
	return c.fetchFile(ctx, mod, "zip")
}

// Latest fetches the optional /@latest endpoint for the given module.
// It returns os.ErrNotExist if the module doesn't exist, or
// if the optional /@latest endpoint isn't implemented by the server.
func (c Client) Latest(ctx context.Context, modulePath string) (Info, error) {
	b, err := c.fetchLatest(ctx, modulePath)
	if err != nil {
		return Info{}, err
	}
	var info Info
	err = json.Unmarshal(b, &info)
	return info, err
}

func (c Client) fetchFile(ctx context.Context, mod module.Version, suffix string) ([]byte, error) {
	enc, err := escapePath(mod.Path)
	if err != nil {
		return nil, err
	}
	encVer, err := module.EscapeVersion(mod.Version)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, urlJoinPath(c.URL, enc+"/@v/"+encVer+"."+suffix), nil)
	if err != nil {
		return nil, err
	}
	if c.DisableModuleFetch {
		req.Header.Set("Disable-Module-Fetch", "true")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
		return nil, os.ErrNotExist
	} else if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("non-200 OK status code: %v body: %q", resp.Status, body)
	}
	return ioutil.ReadAll(resp.Body)
}

func (c Client) fetchLatest(ctx context.Context, modulePath string) ([]byte, error) {
	enc, err := escapePath(modulePath)
	if err != nil {
		return nil, err
	}
	resp, err := ctxhttp.Get(ctx, nil, urlJoinPath(c.URL, enc+"/@latest"))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
		return nil, os.ErrNotExist
	} else if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return nil, fmt.Errorf("non-200 OK status code: %v body: %q", resp.Status, body)
	}
	return ioutil.ReadAll(resp.Body)
}

// escapePath returns the escaped form of the given module path.
// It fails if the module path is invalid.
//
// It behaves just like module.EscapePath with one exception,
// it accepts "std" as a valid module path.
func escapePath(path string) (escaped string, err error) {
	switch path {
	case "std":
		return "std", nil
	default:
		return module.EscapePath(path)
	}
}

// Server implements the module proxy protocol
// by proxying off another module proxy at URL.
type Server struct {
	URL url.URL
}

func (s Server) ServeHTTP(w http.ResponseWriter, req *http.Request) error {
	if req.URL.Path == "/" { // XXX, HACK, TODO
		return os.ErrNotExist
	}
	resp, err := ctxhttp.Get(req.Context(), nil, urlJoinPath(s.URL, req.URL.Path))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
		return os.ErrNotExist
	} else if resp.StatusCode != http.StatusOK {
		body, _ := ioutil.ReadAll(resp.Body)
		return fmt.Errorf("non-200 OK status code: %v body: %q", resp.Status, body)
	}
	_, err = io.Copy(w, resp.Body)
	return err
}

func urlJoinPath(u url.URL, p string) string {
	u.Path = path.Join(u.Path, p)
	return u.String()
}
