var exec = require('child_process').exec;
var font = require('./font');

var Watcher = function(config) {
  this._config = config;
  this._timers = {};
  this._warn = Watcher.Warn.ALL;
};

Watcher.Warn = {
  ALL: 10,
  VERBOSE: 10,
  NORMAL: 9,
  QUIET: 0
};

Watcher.prototype.warn = function(warn) {
  this._warn = warn;
};

Watcher.prototype.watch = function() {
  var spawn = require('child_process').spawn;
  var chokidar = require('chokidar');

  this._bash = spawn('bash');

  this._bash.stdout.on('data', (function (data) {
    this.write(process.stdout, data, Watcher.Warn.NORMAL);
  }).bind(this));

  this._bash.stderr.on('data', (function (data) {
    this.write(process.stderr, font.colorize(font.c.Red, data), Watcher.Warn.NORMAL);
  }).bind(this));

  this._watchers = [];

  if (this._config.INITIAL_COMMAND && typeof this._config.INITIAL_COMMAND == 'string') {
    var initial = this._config.INITIAL_COMMAND;
    delete this._config.INITIAL_COMMAND;

    this.write(process.stdout, font.colorize(font.c.Green, "INITIAL: ") + initial + "\n", Watcher.Warn.NORMAL);
    this._bash.stdin.write(initial + "\n");
  }

  for(var path in this._config) {
    var config = this._config[path];
    (config['do'] || [config]).forEach(function(token) {
      if (token.initialExec && token.command) {
        this.write(process.stdout, font.colorize(font.c.Green, "INITIAL RUN: ") + token.command + "\n", Watcher.Warn.NORMAL);
        this._exec(token.command);
      }
    }, this);
    var watcher = chokidar.watch(path, config.options);
    this._listen(watcher, path);
    this._watchers.push(watcher);
  }
};



Watcher.prototype.write = function(writer, str, lvl) {
  if (lvl < this._warn) {
    writer.write(str);
  }
}

Watcher.prototype.close = function() {
  this.write(process.stdout, "Closing child watchers\n", Watcher.Warn.NORMAL);
  this._watchers.forEach(function(watcher) {
    watcher.close();
  });
  this._watchers = [];

  this.write(process.stdout, "Closing child process for commands\n", Watcher.Warn.NORMAL);
  this._bash.stdin.end();
  this.write(process.stdout, "See you!\n", Watcher.Warn.NORMAL);
};

Watcher.prototype._listen = function(watcher, path) {
  watcher
    .on('all', (function(type, file) {
      this._onAll(type, file, path, watcher);
    }).bind(this))
    .on('error', (function(error) {
      this._onError(error, path, watcher);
    }).bind(this));
};

Watcher.prototype._onAll = function(type, file, dir, watcher) {
  var config = this._config[dir];

  // ignoring
  if (config.ignored && config.ignored.test(file)) {
    this.write(process.stdout, font.colorize(font.c.Red, "IGNORED: ") + file + "\n", Watcher.Warn.VERBOSE);
    process.stdout.write(font.colorize(font.c.Red, "IGNORED: ") + file + "\n");
    return;
  }

  // track by mask if defined
  if (config.mask && !config.mask.test(file)) {
    this.write(process.stdout, font.colorize(font.c.Red, "IGNORED: ") + file + "\n", Watcher.Warn.VERBOSE);
    return;
  }

  clearTimeout(this._timers[dir]);
  delete this._timers[dir];

  var tokens = config['do'] || config['command'];

  // has only string command
  if (typeof tokens == "string" || typeof tokens == "function") {
    this.write(process.stdout, font.colorize(font.c.Green, "UPDATE: ") + file + "\n", Watcher.Warn.NORMAL);
    this._timers[dir] = this._exec(tokens, config.delay, file);
    return;
  }

  // has stack of commands
  if (tokens.length === undefined) {
    tokens = [tokens];
  }

  var hasRunnedCommand = false;
  tokens.forEach(function(token) {
    // track by mask if defined
    if (token.mask && !token.mask.test(file)) {
      return;
    }

    var timerName = dir + "__" + token.mask;
    clearTimeout(this._timers[timerName]);
    delete this._timers[timerName];

    if (!hasRunnedCommand) {
      this.write(process.stdout, font.colorize(font.c.Green, "UPDATE: ") + file + "\n", Watcher.Warn.NORMAL);
      hasRunnedCommand = true;
    }
    this._timers[timerName] = this._exec(token.command, token.delay || config.delay, file);
  }, this);

  // has no runned commands
  if (!hasRunnedCommand) {
    this.write(process.stdout, font.colorize(font.c.Red, "IGNORED: ") + file + "\n", Watcher.Warn.VERBOSE);
  }
};

Watcher.prototype._onError = function(error, dir, watcher) {
  this.write(process.stderr, font.colorize(font.c.Red, error), Watcher.Warn.VERBOSE);
};

Watcher.prototype._exec = function(command, opt_delay, opt_path) {
  var execFunc = (function() {
    this.write(process.stdout, font.colorize(font.c.Green, "RUN: ") + command + "\n", Watcher.Warn.VERBOSE);
    if (typeof command == 'function') {
      command(opt_path);
    } else {
      this._bash.stdin.write(this._definedEnv(opt_path) + command + "\n");
    }
  }).bind(this);

  if (opt_delay) {
    return setTimeout(execFunc, opt_delay);
  }

  execFunc();
  return -1;
};

Watcher.prototype._definedEnv = function(path) {
  if (!path) {
    return '';
  }

  var p = require('path');
  return [
    "WATCHER_PATH=" + path,
    "WATCHER_DIRNAME=" + p.dirname(path),
    "WATCHER_FILENAME=" + p.basename(path)
  ].join(';') + ';';
};

exports.Watcher = Watcher;
