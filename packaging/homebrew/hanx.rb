class Hanx < Formula
  desc "Local office document CLI, desktop setup, and MCP tools"
  homepage "https://hanx.io/"
  version "2.13.5"
  license "MIT"

  on_macos do
    url "https://github.com/FLOVER124/HanX/releases/download/v2.13.5/HanX-CLI-2.13.5-macOS.zip"
    sha256 "474571d0a16ba416927bb535a914eefd80b86dab6e4a01d6197e7eb4d303aa62"
    depends_on :macos => :ventura
  end
  on_linux do
    on_intel do
      url "https://github.com/FLOVER124/HanX/releases/download/v2.13.5/HanX-CLI-2.13.5-linux-x64.tar.gz"
      sha256 "866894ccc10aad4da3c60c13ba59ba1f736b5aa61f06c7ee051b4dbce8721d0e"
    end
  end
  depends_on "node"

  resource "setup" do
    url "https://github.com/FLOVER124/HanX/releases/download/v2.13.5/HanX-Setup-2.13.5.tar.gz"
    sha256 "16fdd41005ccfb816c4abb272d45b7957c6635f23d2fc2a79b2534b587ac10ec"
  end

  def install
    platform = OS.mac? ? "darwin" : "linux"
    arch = Hardware::CPU.arm? ? "arm64" : "x64"
    native = libexec/"native/#{platform}-#{arch}"
    native.install Dir["*"]
    resource("setup").stage { libexec.install "bin", "lib", "package.json" }
    (bin/"hanx").write <<~SH
      #!/bin/sh
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/bin/hanx.js" "$@"
    SH
    bin.install_symlink "hanx" => "hanx-cli"
    pkgshare.install native/"LICENSE", native/"NOTICE"
  end

  def caveats
    <<~EOS
      CLI is ready. Run `hanx setup` to choose CLI only, GUI only, or both.
      Homebrew lifecycle installation never blocks on a prompt and never downloads a GUI.
      GUI-only keeps the small setup launcher and disables terminal document commands.
      The desktop app retains an internal engine. Linux GUI installation is per-user.
      PDF export may require a compatible local renderer; none is installed automatically.
    EOS
  end

  test do
    require "json"
    assert_equal version.to_s, JSON.parse(shell_output("#{bin}/hanx --version"))["data"]["version"]
    (testpath/"spec.json").write(JSON.generate({kind: "spreadsheet", sheets: [{name: "Data", rows: [[2], [4]], cells: {"B1" => "=SUM(A1:A2)"}}]}))
    system bin/"hanx", "create", "--spec", testpath/"spec.json", "--output", testpath/"test.xlsx"
    data = JSON.parse(shell_output("#{bin}/hanx spreadsheet read #{testpath}/test.xlsx --sheet Data --range B1"))
    assert_equal 6, data["data"]["cells"][0]["value"]
  end
end
