import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from 'app/core/auth/auth.service';
import { AuthApiService } from 'app/core/services/auth-api.service';
import { UserService } from 'app/core/user/user.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [RouterOutlet],
})
export class AppComponent implements OnInit {
  private _authService = inject(AuthService);
  private _authApiService = inject(AuthApiService);
  private _userService = inject(UserService);

  /**
   * Constructor
   */
  constructor() {}

  ngOnInit(): void {
    const token = localStorage.getItem('accessToken');
    if (token) {
      // Ensure auth service has the token
      this._authService.accessToken = token;

      // Refresh session data
      this._authApiService.getSession().subscribe({
        next: (res: any) => {
          const userData = res.data?.user || res.user || res;
          localStorage.setItem('verifik_account', JSON.stringify(userData));
          this._authService.accessToken = token; // Ensure token is set
          // Update UserService so all subscribers get the new data
          // We need to access the private user service or cast it if it's protected,
          // but UserService has a public setter 'set user(value: User)'
          // so we need to inject UserService in AppComponent
          this._userService.user = userData;
        },
        error: (err) => {
          console.error('Failed to restore session on app init', err);
          // Optional: Clear invalid token?
          // localStorage.removeItem('accessToken');
        },
      });
    }
  }
}
