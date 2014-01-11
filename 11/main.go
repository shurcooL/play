// Creates a subprocess and forwards stdin/stdout/stderr over, until the subprocess exits.
package main

import (
	"os"
	"os/exec"

	. "gist.github.com/5286084.git"
)

func main() {
	cmd := exec.Command("bash")
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err := cmd.Start()
	CheckError(err)
	_ = cmd.Wait()
}
