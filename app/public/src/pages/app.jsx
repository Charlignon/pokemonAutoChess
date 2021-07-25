import React, { Component } from 'react';
import { Route, Switch } from 'react-router-dom';
import Home from './home';
import Auth from './auth';
import Lobby from './lobby';
import Preparation from './preparation';
import Game from './game';

class App extends Component {
  render() {
    const App = () => (
      <div>
        <Switch>
          <Route exact path='/' component={Home}/>
          <Route path='/auth' component={Auth}/>
          <Route path='/lobby' component={Lobby}/>
          <Route path='/preparation/:id' component={Preparation}/>
          <Route path='/game/:id' component={Game}/>
        </Switch>
      </div>
    )
    return (
      <Switch>
        <App/>
      </Switch>
    );
  }
}

export default App;