This Go package has moved, its new import path is:

```Go
"github.com/shurcooL/go/gists/gist{{.GistId}}"
```

You can update all your references automatically by using [govers](http://godoc.org/launchpad.net/govers):

```bash
cd $GOPATH/src
govers -m 'gist.github.com/{{.GistId}}.git' 'github.com/shurcooL/go/gists/gist{{.GistId}}'
```
