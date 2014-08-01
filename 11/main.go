// Creates a subprocess and forwards stdin/stdout/stderr over, until the subprocess exits.
package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"

	. "github.com/shurcooL/go/gists/gist5286084"
)

func main() {
	fmt.Println("Enter a line:")

	buf := bufio.NewReader(os.Stdin)
	line, err := buf.ReadString('\n')

	fmt.Printf("You typed: %q (%v error)\n", line, err)

	fmt.Println("---")

	cmd := exec.Command("bash")
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err = cmd.Start()
	CheckError(err)
	_ = cmd.Wait()
}
