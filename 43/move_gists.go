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
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/4668739.git && git push && cd ../ && rm -rf ./4668739.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/4670289.git && git push && cd ../ && rm -rf ./4670289.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/4727543.git && git push && cd ../ && rm -rf ./4727543.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/4737109.git && git push && cd ../ && rm -rf ./4737109.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5022726.git && git push && cd ../ && rm -rf ./5022726.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5092053.git && git push && cd ../ && rm -rf ./5092053.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5210270.git && git push && cd ../ && rm -rf ./5210270.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5258650.git && git push && cd ../ && rm -rf ./5258650.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5259939.git && git push && cd ../ && rm -rf ./5259939.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5286084.git && git push && cd ../ && rm -rf ./5286084.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5408736.git && git push && cd ../ && rm -rf ./5408736.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5408860.git && git push && cd ../ && rm -rf ./5408860.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5423254.git && git push && cd ../ && rm -rf ./5423254.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5439318.git && git push && cd ../ && rm -rf ./5439318.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5498057.git && git push && cd ../ && rm -rf ./5498057.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5504644.git && git push && cd ../ && rm -rf ./5504644.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5571468.git && git push && cd ../ && rm -rf ./5571468.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5639599.git && git push && cd ../ && rm -rf ./5639599.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5645828.git && git push && cd ../ && rm -rf ./5645828.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5707298.git && git push && cd ../ && rm -rf ./5707298.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5892738.git && git push && cd ../ && rm -rf ./5892738.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/5953185.git && git push && cd ../ && rm -rf ./5953185.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/6003701.git && git push && cd ../ && rm -rf ./6003701.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/6096872.git && git push && cd ../ && rm -rf ./6096872.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/6197035.git && git push && cd ../ && rm -rf ./6197035.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/6244612.git && git push && cd ../ && rm -rf ./6244612.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/6418290.git && git push && cd ../ && rm -rf ./6418290.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/6418462.git && git push && cd ../ && rm -rf ./6418462.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/6433744.git && git push && cd ../ && rm -rf ./6433744.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/6445065.git && git push && cd ../ && rm -rf ./6445065.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/6545684.git && git push && cd ../ && rm -rf ./6545684.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/6724654.git && git push && cd ../ && rm -rf ./6724654.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7390843.git && git push && cd ../ && rm -rf ./7390843.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7480523.git && git push && cd ../ && rm -rf ./7480523.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7519227.git && git push && cd ../ && rm -rf ./7519227.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7576154.git && git push && cd ../ && rm -rf ./7576154.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7576804.git && git push && cd ../ && rm -rf ./7576804.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7651991.git && git push && cd ../ && rm -rf ./7651991.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7728088.git && git push && cd ../ && rm -rf ./7728088.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7729255.git && git push && cd ../ && rm -rf ./7729255.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/7802150.git && git push && cd ../ && rm -rf ./7802150.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/8018045.git && git push && cd ../ && rm -rf ./8018045.git
cd /Users/Dmitri/Dropbox/Work/2013/GoLand/src/gist.github.com/8065433.git && git push && cd ../ && rm -rf ./8065433.git
*/
