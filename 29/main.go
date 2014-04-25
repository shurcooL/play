// Dummy package for testing import sorting of "github.com/shurcooL/go/exp/11".InlineDotImports.
package main

import (
	"syscall"
	"io"
	"fmt"
	"github.com/pkg/sftp"
	"net"
	"code.google.com/p/go.crypto/ssh"
	"code.google.com/p/go.crypto/ssh/agent"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/shurcooL/go/exp/11"
)

func main() {
	var _ = io.Copy
	var _ sync.Cond
	var _ = syscall.Accept
	var _ = fmt.Errorf
	var _ sftp.Client
	var _ = net.InterfaceAddrs
	var _ = ssh.DiscardRequests
	var _ = agent.ForwardToAgent
	var _ = os.Chdir
	var _ = runtime.BlockProfile
	var _ = time.After
	var _ = exp11.InlineDotImports
}
