GOOS=js GOARCH=wasm go build -o main.wasm && echo ok && goexec 'http.ListenAndServe(":8080", http.FileServer(http.Dir(".")))'
