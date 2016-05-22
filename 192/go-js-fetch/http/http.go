package http

import (
	"errors"
	"io"
	"io/ioutil"
	"net/http"
	"strconv"

	"github.com/gopherjs/gopherjs/js"

	"github.com/shurcooL/play/192/go-js-fetch"
)

var _ = fetch.Foo

// streamReader implements an io.ReadCloser wrapper for ReadableStream of https://fetch.spec.whatwg.org/.
type streamReader struct {
	pending []byte
	stream  *js.Object
}

func (r *streamReader) Read(p []byte) (n int, err error) {
	if len(r.pending) == 0 {
		var (
			bCh   = make(chan []byte)
			errCh = make(chan error)
		)
		r.stream.Call("read").Call("then",
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

func (r *streamReader) Close() error {
	// TOOD: Cannot do this because it's a blocking call, and Close() is often called
	//       via `defer resp.Body.Close()`, but GopherJS currently has an issue with supporting that.
	//       See https://github.com/gopherjs/gopherjs/issues/381 and https://github.com/gopherjs/gopherjs/issues/426.
	/*ch := make(chan error)
	r.stream.Call("cancel").Call("then",
		func(result *js.Object) {
			if result != js.Undefined {
				ch <- errors.New(result.String()) // TODO: Verify this works, it probably doesn't and should be rewritten as result.Get("message").String() or something.
				return
			}
			ch <- nil
		},
	)
	return <-ch*/
	r.stream.Call("cancel")
	return nil
}

type FetchTransport struct{}

func (t *FetchTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	fetch := js.Global.Get("fetch")
	if fetch == js.Undefined {
		return nil, errors.New("net/http: Fetch API not available")
	}
	if js.Global.Get("ReadableStream") == js.Undefined {
		return nil, errors.New("net/http: Stream API not available")
	}

	headers := js.Global.Get("Headers").New()
	for key, values := range req.Header {
		for _, value := range values {
			headers.Call("append", key, value)
		}
	}
	opt := map[string]interface{}{
		"method":  req.Method,
		"headers": headers,
		//"redirect": "manual",
	}
	if req.Body != nil {
		// TODO: Find out if request body can be streamed into the fetch request rather than in advance here.
		//       See BufferSource at https://fetch.spec.whatwg.org/#body-mixin.
		body, err := ioutil.ReadAll(req.Body)
		if err != nil {
			req.Body.Close() // RoundTrip must always close the body, including on errors.
			return nil, err
		}
		req.Body.Close()
		opt["body"] = body
	}
	respPromise := fetch.Invoke(req.URL.String(), opt)

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

			header := http.Header{}
			result.Get("headers").Call("forEach", func(value, key *js.Object) {
				ck := http.CanonicalHeaderKey(key.String())
				header[ck] = append(header[ck], value.String())
			})

			contentLength := int64(-1)
			if cl, err := strconv.ParseInt(header.Get("Content-Length"), 10, 64); err == nil {
				contentLength = cl
			}

			/*var body io.ReadCloser
			if b := result.Get("body"); b != nil {
				body = &streamReader{stream: b.Call("getReader")}
			} else {
				body = noBody
			}*/

			respCh <- &http.Response{
				Status:        result.Get("status").String() + " " + statusText,
				StatusCode:    result.Get("status").Int(),
				Header:        header,
				ContentLength: contentLength,
				Body:          &streamReader{stream: result.Get("body").Call("getReader")},
				Request:       req,
			}
		},
		func(reason *js.Object) {
			errCh <- errors.New("net/http: fetch() failed")
		},
	)
	select {
	case resp := <-respCh:
		return resp, nil
	case err := <-errCh:
		return nil, err
	case <-req.Cancel:
		// TODO: Abort request if possible using Fetch API.
		return nil, errors.New("net/http: request canceled")
	}
}

// TODO: Consider implementing here if importing those 2 packages is expensive.
//var noBody io.ReadCloser = ioutil.NopCloser(bytes.NewReader(nil))
