package http

import (
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/gopherjs/gopherjs/js"

	"github.com/shurcooL/play/192/go-js-fetch"
)

var _ = fetch.Foo

// streamReader implements a wrapper for ReadableStreamDefaultReader of https://streams.spec.whatwg.org/.
type streamReader struct {
	pending []byte
	reader  *js.Object
}

func (r streamReader) Read(p []byte) (n int, err error) {
	if len(r.pending) == 0 {
		var (
			bCh   = make(chan []byte)
			errCh = make(chan error)
		)
		r.reader.Call("read").Call("then",
			func(result *js.Object) {
				if result.Get("done").Bool() {
					errCh <- io.EOF
					return
				}
				bCh <- result.Get("value").Interface().([]byte)
			},
			func(reason *js.Object) {
				// Assumes it's a DOMException.
				errCh <- errors.New(reason.Get("message").String())
			},
		)
		select {
		case b := <-bCh:
			r.pending = b
		case err := <-errCh:
			return 0, err
		}
	}
	n = copy(p, r.pending)
	r.pending = r.pending[n:]
	return n, nil
}

func (streamReader) Close() error {
	// TODO: r.reader.cancel(reason) maybe?
	return nil
}

type FetchTransport struct{}

func (t *FetchTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	fetch := js.Global.Get("fetch")
	if fetch == js.Undefined {
		return nil, errors.New("net/http: Fetch API not available")
	}

	headers := js.Global.Get("Headers").New()
	for key, values := range req.Header {
		for _, value := range values {
			headers.Call("set", key, value)
		}
	}
	respPromise := fetch.Invoke(req.URL.String(), map[string]interface{}{
		"method":  req.Method,
		"headers": headers,
	})

	respCh := make(chan *http.Response)
	errCh := make(chan error)
	respPromise.Call("then",
		func(result *js.Object) {
			//println(result)
			//println(result.Get("headers"))
			//println(result.Get("headers").Call("has", "Content-Type"))
			//println(result.Get("headers").Call("has", "Content-Length"))
			//println(result.Get("headers").Call("get", "Content-Type"))
			//println(result.Get("headers").Call("get", "Content-Length"))
			//statusText := result.Get("statusText").String()
			statusText := http.StatusText(result.Get("status").Int())

			// TODO: Make this better.
			header := http.Header{}
			result.Get("headers").Call("forEach", func(value, key *js.Object) {
				header[http.CanonicalHeaderKey(key.String())] = []string{value.String()} // TODO: Support multiple values.
			})

			contentLength := int64(-1)
			if cl, err := strconv.ParseInt(result.Get("headers").Call("get", "content-length").String(), 10, 64); err == nil {
				contentLength = cl
			}

			respCh <- &http.Response{
				Status:        result.Get("status").String() + " " + statusText,
				StatusCode:    result.Get("status").Int(),
				Header:        header,
				ContentLength: contentLength,
				Body:          &streamReader{reader: result.Get("body").Call("getReader")},
				Request:       req,
			}
		},
		func(reason *js.Object) {
			errCh <- errors.New("net/http: XMLHttpRequest failed")
		},
	)
	select {
	case resp := <-respCh:
		return resp, nil
	case err := <-errCh:
		return nil, err
	}
}

func (t *FetchTransport) CancelRequest(req *http.Request) {
	// TODO.
}
