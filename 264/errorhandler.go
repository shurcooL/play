package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/shurcooL/httperror"
)

type errorHandler struct {
	handler func(w http.ResponseWriter, req *http.Request) error
}

func (h errorHandler) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	rw := &headerResponseWriter{ResponseWriter: w}
	err := h.handler(rw, req)
	if err == nil {
		// Do nothing.
		return
	}
	if err != nil && rw.WroteHeader {
		// The header has already been written, so it's too late to send
		// a different status code. Just log the error and move on.
		log.Println(err)
		return
	}
	if err, ok := httperror.IsMethod(err); ok {
		httperror.HandleMethod(w, err)
		return
	}
	if err, ok := httperror.IsRedirect(err); ok {
		http.Redirect(w, req, err.URL, http.StatusSeeOther)
		return
	}
	if err, ok := httperror.IsBadRequest(err); ok {
		httperror.HandleBadRequest(w, err)
		return
	}
	if err, ok := httperror.IsHTTP(err); ok {
		code := err.Code
		http.Error(w, fmt.Sprintf("%d %s", code, http.StatusText(code))+"\n\n"+err.Error(), code)
		return
	}
	if err, ok := httperror.IsJSONResponse(err); ok {
		w.Header().Set("Content-Type", "application/json")
		jw := json.NewEncoder(w)
		jw.SetIndent("", "\t")
		err := jw.Encode(err.V)
		if err != nil {
			log.Println("error encoding JSONResponse:", err)
		}
		return
	}
	if os.IsNotExist(err) {
		log.Println(err)
		http.Error(w, "404 Not Found\n\n"+err.Error(), http.StatusNotFound)
		return
	}
	if os.IsPermission(err) {
		log.Println(err)
		http.Error(w, "403 Forbidden\n\n"+err.Error(), http.StatusForbidden)
		return
	}

	log.Println(err)
	http.Error(w, "500 Internal Server Error\n\n"+err.Error(), http.StatusInternalServerError)
}

// headerResponseWriter wraps a real http.ResponseWriter and captures
// whether or not the header has been written.
type headerResponseWriter struct {
	http.ResponseWriter

	WroteHeader bool // Write or WriteHeader was called.
}

func (rw *headerResponseWriter) Write(p []byte) (n int, err error) {
	rw.WroteHeader = true
	return rw.ResponseWriter.Write(p)
}
func (rw *headerResponseWriter) WriteHeader(code int) {
	rw.WroteHeader = true
	rw.ResponseWriter.WriteHeader(code)
}
