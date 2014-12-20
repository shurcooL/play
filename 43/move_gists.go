// Move all my Go library packages from gist.github.com/{{.GistId}}.git to github.com/shurcooL/go/gists/gist{{.GistId}}.
package main

import (
	"os"
	"os/exec"
	"strings"
	"text/template"
)

func main() {
	doAll()
}

func doAll() {
	cmd := exec.Command("go", "list", "-f", `{{if eq .Name "main"}}{{.ImportPath}}{{end}}`, "gist.github.com/...")
	out, err := cmd.Output()
	if err != nil {
		panic(err)
	}

	xxx := strings.Split(strings.TrimSuffix(string(out), "\n"), "\n")

	for _, name := range xxx {
		gistId := strings.TrimSuffix(strings.TrimPrefix(name, "gist.github.com/"), ".git")
		doOne(gistId)
	}
}

var t = template.Must(template.New("t").Parse(`
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/play
git subtree add --prefix=old_gists/gist{{.GistId}} -m 'Move gist{{.GistId}} package.' '/Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/{{.GistId}}.git' master

cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/{{.GistId}}.git
git remote set-url origin https://gist.github.com/{{.GistId}}.git
rm ./*
goe --quiet 'template.Must(template.ParseFiles("/Users/Dmitri/Dropbox/Work/2013/GoLand/src/github.com/shurcooL/play/43/moved_notice.md")).Execute(os.Stdout, struct{ GistId string }{"{{.GistId}}"})' > README.md
git add README.md
git commit -a -m 'Package moved to new import path.'
`))

func doOne(gistId string) {
	t.Execute(os.Stdout, struct{ GistId string }{gistId})
}

/*
# Push move notice on old gists upstream.

cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/3767369.git && git push origin master && cd ../ && rm -rf ./3767369.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5068062.git && git push origin master && cd ../ && rm -rf ./5068062.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5086673.git && git push origin master && cd ../ && rm -rf ./5086673.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5155308.git && git push origin master && cd ../ && rm -rf ./5155308.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5157525.git && git push origin master && cd ../ && rm -rf ./5157525.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5190982.git && git push origin master && cd ../ && rm -rf ./5190982.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5328363.git && git push origin master && cd ../ && rm -rf ./5328363.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5423515.git && git push origin master && cd ../ && rm -rf ./5423515.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5562461.git && git push origin master && cd ../ && rm -rf ./5562461.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5602368.git && git push origin master && cd ../ && rm -rf ./5602368.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5816852.git && git push origin master && cd ../ && rm -rf ./5816852.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/6402377.git && git push origin master && cd ../ && rm -rf ./6402377.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7176504.git && git push origin master && cd ../ && rm -rf ./7176504.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7405773.git && git push origin master && cd ../ && rm -rf ./7405773.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/8090509.git && git push origin master && cd ../ && rm -rf ./8090509.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/8310340.git && git push origin master && cd ../ && rm -rf ./8310340.git
*/
