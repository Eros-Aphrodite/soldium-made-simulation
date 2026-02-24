#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
原位分析模拟模块
In-situ Analysis Simulation Module

基于电化学过程中的实时变化，模拟生成：
1. 原位XRD数据（层间距变化）
2. 原位拉曼光谱（电荷转移和结构变化）
3. 原位EIS数据（阻抗变化）
4. 原位XANES/EXAFS数据（电子结构变化）
5. 原位AFM数据（表面形貌变化）

科学依据：
- 基于Na+嵌入/脱出过程的结构演化
- 考虑电化学反应对材料性质的影响
- 遵循各种原位技术的物理原理
- 模拟真实的时间演化过程
"""

import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
from scipy.interpolate import interp1d
from scipy.signal import savgol_filter
import os

class InSituAnalysisSimulator:
    """原位分析模拟器"""
    
    def __init__(self, matbg_system):
        """
        初始化原位分析模拟器
        
        参数:
        matbg_system: MATBG模拟系统实例
        """
        self.system = matbg_system
        
        # 原位分析参数
        self.insitu_params = {
            'initial_interlayer_distance': 3.36,  # 初始层间距 (Å)
            'max_expansion': 0.23,  # 最大层间距扩展 (Å)
            'charge_transfer_max': 0.15,  # 最大电荷转移 (e)
            'impedance_change_factor': 0.3,  # 阻抗变化因子
        }
    
    def simulate_insitu_xrd(self, voltage_points=None, save_dir=None):
        """
        模拟原位XRD数据
        
        参数:
        voltage_points: 电压点列表 (V)
        save_dir: 保存目录
        
        返回:
        insitu_xrd_data: 原位XRD数据
        """
        if voltage_points is None:
            # 完整的充放电循环
            voltage_points = np.concatenate([
                np.linspace(3.0, 0.01, 50),  # 放电
                np.linspace(0.01, 3.0, 50)   # 充电
            ])
        
        two_theta_range = (20, 35)  # 关注(002)峰区域
        two_theta = np.linspace(two_theta_range[0], two_theta_range[1], 500)
        
        xrd_data = {}
        interlayer_distances = []
        
        for i, voltage in enumerate(voltage_points):
            # 计算当前电压下的层间距
            interlayer_distance = self._calculate_interlayer_distance(voltage)
            interlayer_distances.append(interlayer_distance)
            
            # 计算对应的(002)峰位置
            peak_position = self._calculate_002_peak_position(interlayer_distance)
            
            # 生成XRD图谱
            intensity = self._generate_insitu_xrd_pattern(two_theta, peak_position, voltage)
            
            # 添加噪声
            intensity = self.system.generate_noise(intensity, noise_level=0.03)
            
            xrd_data[i] = {
                'voltage': voltage,
                'two_theta': two_theta,
                'intensity': intensity,
                'interlayer_distance': interlayer_distance,
                'peak_position': peak_position
            }
        
        insitu_xrd_data = {
            'voltage_points': voltage_points,
            'interlayer_distances': np.array(interlayer_distances),
            'xrd_patterns': xrd_data
        }
        
        # 保存数据
        if save_dir:
            self._save_insitu_xrd_data(insitu_xrd_data, save_dir)
        
        return insitu_xrd_data
    
    def simulate_insitu_raman(self, voltage_points=None, save_dir=None):
        """
        模拟原位拉曼光谱数据
        
        参数:
        voltage_points: 电压点列表 (V)
        save_dir: 保存目录
        
        返回:
        insitu_raman_data: 原位拉曼数据
        """
        if voltage_points is None:
            voltage_points = np.concatenate([
                np.linspace(3.0, 0.01, 30),  # 放电
                np.linspace(0.01, 3.0, 30)   # 充电
            ])
        
        wavenumber_range = (1200, 1800)  # 关注G峰区域
        wavenumber = np.linspace(wavenumber_range[0], wavenumber_range[1], 300)
        
        raman_data = {}
        g_peak_positions = []
        g_peak_intensities = []
        
        for i, voltage in enumerate(voltage_points):
            # 计算G峰位移和强度变化
            g_peak_pos, g_peak_int = self._calculate_g_peak_changes(voltage)
            g_peak_positions.append(g_peak_pos)
            g_peak_intensities.append(g_peak_int)
            
            # 生成拉曼光谱
            intensity = self._generate_insitu_raman_spectrum(wavenumber, g_peak_pos, g_peak_int, voltage)
            
            # 添加噪声
            intensity = self.system.generate_noise(intensity, noise_level=0.04)
            
            raman_data[i] = {
                'voltage': voltage,
                'wavenumber': wavenumber,
                'intensity': intensity,
                'g_peak_position': g_peak_pos,
                'g_peak_intensity': g_peak_int
            }
        
        insitu_raman_data = {
            'voltage_points': voltage_points,
            'g_peak_positions': np.array(g_peak_positions),
            'g_peak_intensities': np.array(g_peak_intensities),
            'raman_spectra': raman_data
        }
        
        # 保存数据
        if save_dir:
            self._save_insitu_raman_data(insitu_raman_data, save_dir)
        
        return insitu_raman_data
    
    def simulate_insitu_eis(self, voltage_points=None, frequency_range=(0.01, 100000), save_dir=None):
        """
        模拟原位电化学阻抗谱数据
        
        参数:
        voltage_points: 电压点列表 (V)
        frequency_range: 频率范围 (Hz)
        save_dir: 保存目录
        
        返回:
        insitu_eis_data: 原位EIS数据
        """
        if voltage_points is None:
            voltage_points = np.linspace(3.0, 0.01, 20)
        
        frequencies = np.logspace(np.log10(frequency_range[0]), np.log10(frequency_range[1]), 50)
        
        eis_data = {}
        charge_transfer_resistances = []
        
        for i, voltage in enumerate(voltage_points):
            # 计算电荷转移电阻和其他参数
            rct, rs, cdl, w = self._calculate_eis_parameters(voltage)
            charge_transfer_resistances.append(rct)
            
            # 生成阻抗谱
            z_real, z_imag = self._generate_eis_spectrum(frequencies, rs, rct, cdl, w)
            
            # 添加噪声
            z_real = self.system.generate_noise(z_real, noise_level=0.02)
            z_imag = self.system.generate_noise(z_imag, noise_level=0.02)
            
            eis_data[i] = {
                'voltage': voltage,
                'frequency': frequencies,
                'z_real': z_real,
                'z_imag': z_imag,
                'rct': rct,
                'rs': rs,
                'cdl': cdl
            }
        
        insitu_eis_data = {
            'voltage_points': voltage_points,
            'charge_transfer_resistances': np.array(charge_transfer_resistances),
            'eis_spectra': eis_data
        }
        
        # 保存数据
        if save_dir:
            self._save_insitu_eis_data(insitu_eis_data, save_dir)
        
        return insitu_eis_data
    
    def simulate_insitu_surface_changes(self, voltage_points=None, save_dir=None):
        """
        模拟原位表面变化数据
        
        参数:
        voltage_points: 电压点列表 (V)
        save_dir: 保存目录
        
        返回:
        surface_data: 表面变化数据
        """
        if voltage_points is None:
            voltage_points = np.linspace(3.0, 0.01, 15)
        
        surface_data = {}
        volume_changes = []
        surface_roughnesses = []
        
        for i, voltage in enumerate(voltage_points):
            # 计算体积变化和表面粗糙度
            volume_change = self._calculate_volume_change(voltage)
            surface_roughness = self._calculate_surface_roughness(voltage)
            
            volume_changes.append(volume_change)
            surface_roughnesses.append(surface_roughness)
            
            surface_data[i] = {
                'voltage': voltage,
                'volume_change_percent': volume_change,
                'surface_roughness_nm': surface_roughness,
                'sei_thickness_nm': self._calculate_sei_thickness(voltage)
            }
        
        insitu_surface_data = {
            'voltage_points': voltage_points,
            'volume_changes': np.array(volume_changes),
            'surface_roughnesses': np.array(surface_roughnesses),
            'surface_evolution': surface_data
        }
        
        # 保存数据
        if save_dir:
            self._save_surface_data(insitu_surface_data, save_dir)
        
        return insitu_surface_data
    
    def _calculate_interlayer_distance(self, voltage):
        """计算层间距随电压的变化"""
        # 基于Na+嵌入程度计算层间距扩展
        initial_distance = self.insitu_params['initial_interlayer_distance']
        max_expansion = self.insitu_params['max_expansion']
        
        # 嵌入程度与电压的关系（S型曲线）
        intercalation_degree = 1 / (1 + np.exp((voltage - 0.5) * 10))
        
        # 层间距扩展
        expansion = max_expansion * intercalation_degree
        interlayer_distance = initial_distance + expansion
        
        return interlayer_distance
    
    def _calculate_002_peak_position(self, interlayer_distance):
        """根据层间距计算(002)峰位置"""
        # 布拉格方程: nλ = 2d sinθ
        wavelength = 1.5406  # Cu Kα (Å)
        d_spacing = interlayer_distance
        
        sin_theta = wavelength / (2 * d_spacing)
        theta = np.arcsin(sin_theta)
        two_theta = 2 * np.degrees(theta)
        
        return two_theta
    
    def _generate_insitu_xrd_pattern(self, two_theta, peak_position, voltage):
        """生成原位XRD图谱"""
        # 主(002)峰
        main_peak_intensity = 1000 * (1 + 0.2 * np.sin(voltage * np.pi))  # 强度随电压变化
        main_peak_width = 0.5 + 0.1 * abs(voltage - 1.5)  # 峰宽随电压变化
        
        intensity = main_peak_intensity * np.exp(-0.5 * ((two_theta - peak_position) / main_peak_width)**2)
        
        # 添加其他小峰
        if voltage < 1.0:  # 低电压下出现新相
            new_phase_peak = 200 * np.exp(-0.5 * ((two_theta - peak_position - 1.5) / 0.3)**2)
            intensity += new_phase_peak
        
        # 背景
        background = 50 + 20 * np.exp(-two_theta / 10)
        intensity += background
        
        return intensity
    
    def _calculate_g_peak_changes(self, voltage):
        """计算G峰位移和强度变化"""
        # 基准G峰参数
        base_position = 1580  # cm⁻¹
        base_intensity = 1000
        
        # 电荷转移导致的频率位移
        charge_transfer = self._calculate_charge_transfer(voltage)
        frequency_shift = -15 * charge_transfer  # 红移
        
        # 强度变化
        intensity_change = 1 + 0.3 * charge_transfer
        
        g_peak_position = base_position + frequency_shift
        g_peak_intensity = base_intensity * intensity_change
        
        return g_peak_position, g_peak_intensity
    
    def _calculate_charge_transfer(self, voltage):
        """计算电荷转移程度"""
        max_charge_transfer = self.insitu_params['charge_transfer_max']
        
        # 电荷转移与电压的关系
        if voltage > 2.0:
            charge_transfer = 0
        elif voltage > 0.5:
            charge_transfer = max_charge_transfer * (2.0 - voltage) / 1.5
        else:
            charge_transfer = max_charge_transfer
        
        return charge_transfer
    
    def _generate_insitu_raman_spectrum(self, wavenumber, g_peak_pos, g_peak_int, voltage):
        """生成原位拉曼光谱"""
        # G峰
        g_peak_width = 30 + 10 * abs(voltage - 1.5)  # 峰宽随电压变化
        intensity = g_peak_int / (1 + ((wavenumber - g_peak_pos) / g_peak_width)**2)
        
        # D峰（缺陷相关，低电压下增强）
        if voltage < 1.0:
            d_peak_pos = 1350
            d_peak_int = 200 * (1.0 - voltage)
            d_peak_width = 50
            d_peak = d_peak_int / (1 + ((wavenumber - d_peak_pos) / d_peak_width)**2)
            intensity += d_peak
        
        # 背景
        background = 50 + 30 * np.exp(-(wavenumber - 1400)**2 / 50000)
        intensity += background
        
        return intensity
    
    def _calculate_eis_parameters(self, voltage):
        """计算EIS参数"""
        # 溶液电阻（基本不变）
        rs = 5.0  # Ω
        
        # 电荷转移电阻（随电压变化）
        if voltage > 2.5:
            rct = 100  # 高电压下电阻大
        elif voltage > 0.5:
            rct = 20 + 80 * (voltage - 0.5) / 2.0
        else:
            rct = 20  # 低电压下电阻小
        
        # 双电层电容
        cdl = 50e-6 + 20e-6 * (1 - voltage / 3.0)  # F
        
        # Warburg系数
        w = 100 * np.sqrt(voltage + 0.1)
        
        return rct, rs, cdl, w
    
    def _generate_eis_spectrum(self, frequencies, rs, rct, cdl, w):
        """生成EIS频谱"""
        omega = 2 * np.pi * frequencies
        
        # 等效电路: Rs + (Rct || Cdl) + Warburg
        z_cdl = 1 / (1j * omega * cdl)
        z_rct_cdl = (rct * z_cdl) / (rct + z_cdl)
        z_warburg = w / np.sqrt(omega) * (1 - 1j)
        
        z_total = rs + z_rct_cdl + z_warburg
        
        z_real = np.real(z_total)
        z_imag = -np.imag(z_total)  # 取负值（电容性）
        
        return z_real, z_imag
    
    def _calculate_volume_change(self, voltage):
        """计算体积变化"""
        # 基于层间距变化计算体积变化
        interlayer_distance = self._calculate_interlayer_distance(voltage)
        initial_distance = self.insitu_params['initial_interlayer_distance']
        
        volume_change = (interlayer_distance - initial_distance) / initial_distance * 100
        
        return volume_change
    
    def _calculate_surface_roughness(self, voltage):
        """计算表面粗糙度变化"""
        # 表面粗糙度随循环增加
        base_roughness = 0.5  # nm
        voltage_effect = 0.3 * abs(voltage - 1.5)  # 极端电压下粗糙度增加
        
        surface_roughness = base_roughness + voltage_effect
        
        return surface_roughness
    
    def _calculate_sei_thickness(self, voltage):
        """计算SEI膜厚度"""
        if voltage > 1.0:
            sei_thickness = 0  # 高电压下无SEI
        else:
            sei_thickness = 2.0 * (1.0 - voltage)  # 低电压下SEI增厚
        
        return sei_thickness
    
    def _save_insitu_xrd_data(self, data, save_dir):
        """保存原位XRD数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存层间距变化
        summary_df = pd.DataFrame({
            'Voltage_V': data['voltage_points'],
            'Interlayer_Distance_A': data['interlayer_distances']
        })
        summary_df.to_csv(os.path.join(save_dir, 'insitu_xrd_summary.csv'), index=False)
        
        # 保存详细光谱数据（选择几个代表性点）
        representative_indices = [0, len(data['voltage_points'])//4, len(data['voltage_points'])//2, 
                                3*len(data['voltage_points'])//4, len(data['voltage_points'])-1]
        
        for idx in representative_indices:
            if idx < len(data['xrd_patterns']):
                pattern_data = data['xrd_patterns'][idx]
                df = pd.DataFrame({
                    'Two_Theta_deg': pattern_data['two_theta'],
                    'Intensity_counts': pattern_data['intensity']
                })
                filename = f"insitu_xrd_pattern_V{pattern_data['voltage']:.2f}.csv"
                df.to_csv(os.path.join(save_dir, filename), index=False)
    
    def _save_insitu_raman_data(self, data, save_dir):
        """保存原位拉曼数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存G峰变化
        summary_df = pd.DataFrame({
            'Voltage_V': data['voltage_points'],
            'G_Peak_Position_cm-1': data['g_peak_positions'],
            'G_Peak_Intensity_counts': data['g_peak_intensities']
        })
        summary_df.to_csv(os.path.join(save_dir, 'insitu_raman_summary.csv'), index=False)
        
        # 保存代表性光谱
        representative_indices = [0, len(data['voltage_points'])//4, len(data['voltage_points'])//2, 
                                3*len(data['voltage_points'])//4, len(data['voltage_points'])-1]
        
        for idx in representative_indices:
            if idx < len(data['raman_spectra']):
                spectrum_data = data['raman_spectra'][idx]
                df = pd.DataFrame({
                    'Wavenumber_cm-1': spectrum_data['wavenumber'],
                    'Intensity_counts': spectrum_data['intensity']
                })
                filename = f"insitu_raman_spectrum_V{spectrum_data['voltage']:.2f}.csv"
                df.to_csv(os.path.join(save_dir, filename), index=False)
    
    def _save_insitu_eis_data(self, data, save_dir):
        """保存原位EIS数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存电荷转移电阻变化
        summary_df = pd.DataFrame({
            'Voltage_V': data['voltage_points'],
            'Charge_Transfer_Resistance_Ohm': data['charge_transfer_resistances']
        })
        summary_df.to_csv(os.path.join(save_dir, 'insitu_eis_summary.csv'), index=False)
        
        # 保存代表性EIS谱
        representative_indices = [0, len(data['voltage_points'])//3, 2*len(data['voltage_points'])//3, len(data['voltage_points'])-1]
        
        for idx in representative_indices:
            if idx < len(data['eis_spectra']):
                eis_data = data['eis_spectra'][idx]
                df = pd.DataFrame({
                    'Frequency_Hz': eis_data['frequency'],
                    'Z_Real_Ohm': eis_data['z_real'],
                    'Z_Imag_Ohm': eis_data['z_imag']
                })
                filename = f"insitu_eis_spectrum_V{eis_data['voltage']:.2f}.csv"
                df.to_csv(os.path.join(save_dir, filename), index=False)
    
    def _save_surface_data(self, data, save_dir):
        """保存表面变化数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存表面变化汇总
        summary_data = []
        for i, voltage in enumerate(data['voltage_points']):
            surface_info = data['surface_evolution'][i]
            summary_data.append({
                'Voltage_V': voltage,
                'Volume_Change_Percent': surface_info['volume_change_percent'],
                'Surface_Roughness_nm': surface_info['surface_roughness_nm'],
                'SEI_Thickness_nm': surface_info['sei_thickness_nm']
            })
        
        summary_df = pd.DataFrame(summary_data)
        summary_df.to_csv(os.path.join(save_dir, 'insitu_surface_changes.csv'), index=False)
    
    def simulate_insitu_xanes(self, voltage_points=None, save_dir=None):
        """
        模拟原位XANES数据
        
        XANES (X-ray Absorption Near Edge Structure) 用于分析元素的电子结构和氧化态
        这里模拟Na K-edge XANES
        
        参数:
        voltage_points: 电压点列表 (V)
        save_dir: 保存目录
        
        返回:
        insitu_xanes_data: 原位XANES数据
        """
        if voltage_points is None:
            voltage_points = np.linspace(3.0, 0.01, 15)
        
        # Na K-edge 能量范围 (~1070 eV)
        energy = np.linspace(1060, 1120, 300)
        
        xanes_data = {}
        edge_positions = []
        white_line_intensities = []
        
        for i, voltage in enumerate(voltage_points):
            # 计算Na的氧化态变化
            oxidation_state = self._calculate_na_oxidation_state(voltage)
            
            # 生成XANES谱
            absorption, edge_pos, wl_intensity = self._generate_xanes_spectrum(
                energy, voltage, oxidation_state
            )
            
            edge_positions.append(edge_pos)
            white_line_intensities.append(wl_intensity)
            
            # 添加噪声
            absorption = self.system.generate_noise(absorption, noise_level=0.02)
            
            xanes_data[i] = {
                'voltage': voltage,
                'energy': energy,
                'absorption': absorption,
                'edge_position': edge_pos,
                'white_line_intensity': wl_intensity,
                'oxidation_state': oxidation_state
            }
        
        insitu_xanes_data = {
            'voltage_points': voltage_points,
            'edge_positions': np.array(edge_positions),
            'white_line_intensities': np.array(white_line_intensities),
            'xanes_spectra': xanes_data,
            'edge_type': 'Na K-edge',
            'energy_range_eV': (1060, 1120)
        }
        
        if save_dir:
            self._save_insitu_xanes_data(insitu_xanes_data, save_dir)
        
        return insitu_xanes_data
    
    def _calculate_na_oxidation_state(self, voltage):
        """计算Na的有效氧化态"""
        # Na+嵌入时，电荷转移导致有效氧化态变化
        # 高电压: Na+ (氧化态 +1)
        # 低电压: 部分还原，有效氧化态降低
        if voltage > 2.0:
            return 1.0
        elif voltage > 0.5:
            return 1.0 - 0.2 * (2.0 - voltage) / 1.5
        else:
            return 0.8 - 0.1 * (0.5 - voltage) / 0.5
    
    def _generate_xanes_spectrum(self, energy, voltage, oxidation_state):
        """生成XANES谱"""
        # 边缘能量随氧化态变化
        base_edge = 1071.0  # Na K-edge基准位置
        edge_shift = -0.5 * (1.0 - oxidation_state)  # 还原态时红移
        edge_position = base_edge + edge_shift
        
        # 吸收边阶跃函数 (arctangent)
        edge_width = 1.5
        absorption = 0.5 * (1 + np.arctan((energy - edge_position) / edge_width) / (np.pi/2))
        
        # 白线峰 (White line)
        white_line_pos = edge_position + 3.0
        white_line_width = 2.0
        white_line_intensity = 0.3 + 0.2 * oxidation_state  # 氧化态越高，白线越强
        white_line = white_line_intensity * np.exp(-0.5 * ((energy - white_line_pos) / white_line_width)**2)
        absorption += white_line
        
        # 边缘后振荡 (EXAFS区域的开始)
        if voltage < 1.5:  # 低电压下有更多结构
            oscillation = 0.05 * np.sin((energy - edge_position) * 0.5) * \
                         np.exp(-(energy - edge_position) / 30)
            oscillation = np.where(energy > edge_position + 5, oscillation, 0)
            absorption += oscillation
        
        # 归一化
        absorption = absorption / np.max(absorption)
        
        return absorption, edge_position, white_line_intensity
    
    def simulate_insitu_exafs(self, voltage_points=None, save_dir=None):
        """
        模拟原位EXAFS数据
        
        EXAFS (Extended X-ray Absorption Fine Structure) 用于分析局部原子结构
        
        参数:
        voltage_points: 电压点列表 (V)
        save_dir: 保存目录
        
        返回:
        insitu_exafs_data: 原位EXAFS数据
        """
        if voltage_points is None:
            voltage_points = np.linspace(3.0, 0.01, 10)
        
        # k空间范围
        k = np.linspace(2, 12, 200)  # Å⁻¹
        
        exafs_data = {}
        coordination_numbers = []
        bond_lengths = []
        
        for i, voltage in enumerate(voltage_points):
            # 计算配位环境变化
            cn, r = self._calculate_coordination_environment(voltage)
            coordination_numbers.append(cn)
            bond_lengths.append(r)
            
            # 生成EXAFS振荡
            chi_k = self._generate_exafs_oscillation(k, cn, r, voltage)
            
            # k加权
            chi_k_weighted = chi_k * k**2
            
            # 添加噪声
            chi_k_weighted = self.system.generate_noise(chi_k_weighted, noise_level=0.03)
            
            exafs_data[i] = {
                'voltage': voltage,
                'k': k,
                'chi_k': chi_k,
                'chi_k_weighted': chi_k_weighted,
                'coordination_number': cn,
                'bond_length': r
            }
        
        # 傅里叶变换到R空间
        r_space = np.linspace(0, 6, 300)  # Å
        
        insitu_exafs_data = {
            'voltage_points': voltage_points,
            'coordination_numbers': np.array(coordination_numbers),
            'bond_lengths': np.array(bond_lengths),
            'exafs_spectra': exafs_data,
            'k_range': (2, 12),
            'r_range': (0, 6)
        }
        
        if save_dir:
            self._save_insitu_exafs_data(insitu_exafs_data, save_dir)
        
        return insitu_exafs_data
    
    def _calculate_coordination_environment(self, voltage):
        """计算Na的配位环境"""
        # Na嵌入石墨烯层间时的配位数和键长
        # 高电压（未嵌入）: 配位数低
        # 低电压（完全嵌入）: 配位数高，与碳原子配位
        
        if voltage > 2.0:
            coordination_number = 2.0  # 少量Na在表面
            bond_length = 2.8  # Å, Na-C距离
        elif voltage > 0.5:
            # 逐渐嵌入
            intercalation = (2.0 - voltage) / 1.5
            coordination_number = 2.0 + 4.0 * intercalation
            bond_length = 2.8 - 0.2 * intercalation
        else:
            # 完全嵌入
            coordination_number = 6.0  # NaC6配位
            bond_length = 2.5  # Å
        
        return coordination_number, bond_length
    
    def _generate_exafs_oscillation(self, k, cn, r, voltage):
        """生成EXAFS振荡信号"""
        # 简化的EXAFS公式
        # χ(k) = S₀² × N × f(k) × exp(-2σ²k²) × exp(-2r/λ) × sin(2kr + φ) / (kr²)
        
        S0_squared = 0.9  # 振幅衰减因子
        sigma_squared = 0.005  # Debye-Waller因子
        lambda_mfp = 10  # 平均自由程 (Å)
        
        # 背散射振幅（简化）
        f_k = 0.8 * np.exp(-0.05 * k)
        
        # 相移（简化）
        phi = -0.5 * k + np.pi / 4
        
        # EXAFS公式
        chi = S0_squared * cn * f_k * np.exp(-2 * sigma_squared * k**2) * \
              np.exp(-2 * r / lambda_mfp) * np.sin(2 * k * r + phi) / (k * r**2)
        
        # 电压相关的额外调制
        voltage_factor = 1 + 0.1 * np.sin(voltage * np.pi)
        chi *= voltage_factor
        
        return chi
    
    def _save_insitu_xanes_data(self, data, save_dir):
        """保存原位XANES数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存汇总
        summary_df = pd.DataFrame({
            'Voltage_V': data['voltage_points'],
            'Edge_Position_eV': data['edge_positions'],
            'White_Line_Intensity': data['white_line_intensities']
        })
        summary_df.to_csv(os.path.join(save_dir, 'insitu_xanes_summary.csv'), index=False)
        
        # 保存代表性谱
        representative_indices = [0, len(data['voltage_points'])//2, len(data['voltage_points'])-1]
        for idx in representative_indices:
            if idx < len(data['xanes_spectra']):
                spectrum = data['xanes_spectra'][idx]
                df = pd.DataFrame({
                    'Energy_eV': spectrum['energy'],
                    'Normalized_Absorption': spectrum['absorption']
                })
                filename = f"insitu_xanes_V{spectrum['voltage']:.2f}.csv"
                df.to_csv(os.path.join(save_dir, filename), index=False)
    
    def _save_insitu_exafs_data(self, data, save_dir):
        """保存原位EXAFS数据"""
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)
        
        # 保存汇总
        summary_df = pd.DataFrame({
            'Voltage_V': data['voltage_points'],
            'Coordination_Number': data['coordination_numbers'],
            'Bond_Length_A': data['bond_lengths']
        })
        summary_df.to_csv(os.path.join(save_dir, 'insitu_exafs_summary.csv'), index=False)
        
        # 保存代表性谱
        representative_indices = [0, len(data['voltage_points'])//2, len(data['voltage_points'])-1]
        for idx in representative_indices:
            if idx < len(data['exafs_spectra']):
                spectrum = data['exafs_spectra'][idx]
                df = pd.DataFrame({
                    'k_inv_A': spectrum['k'],
                    'chi_k': spectrum['chi_k'],
                    'chi_k_k2_weighted': spectrum['chi_k_weighted']
                })
                filename = f"insitu_exafs_V{spectrum['voltage']:.2f}.csv"
                df.to_csv(os.path.join(save_dir, filename), index=False)

def main():
    """测试原位分析模拟器"""
    # [修复] 原模块名错误，core_system不存在
    # 原代码: from core_system import MATBGSimulationSystem
    # 修改为: from core_system_revised import MATBGSimulationSystem
    from core_system_revised import MATBGSimulationSystem
    
    # 初始化系统
    matbg_system = MATBGSimulationSystem(twist_angle=1.1)
    insitu_sim = InSituAnalysisSimulator(matbg_system)
    
    print("开始原位分析模拟...")
    
    # 定义电压点
    voltage_points = np.concatenate([
        np.linspace(3.0, 0.01, 20),  # 放电
        np.linspace(0.01, 3.0, 20)   # 充电
    ])
    
    # 模拟各种原位分析
    print("1. 模拟原位XRD...")
    insitu_xrd = insitu_sim.simulate_insitu_xrd(
        voltage_points=voltage_points[:10],  # 减少点数以加快测试
        save_dir="simulation_results/insitu"
    )
    
    print("2. 模拟原位拉曼...")
    insitu_raman = insitu_sim.simulate_insitu_raman(
        voltage_points=voltage_points[:10],
        save_dir="simulation_results/insitu"
    )
    
    print("3. 模拟原位EIS...")
    insitu_eis = insitu_sim.simulate_insitu_eis(
        voltage_points=voltage_points[:8],
        save_dir="simulation_results/insitu"
    )
    
    print("4. 模拟表面变化...")
    surface_changes = insitu_sim.simulate_insitu_surface_changes(
        voltage_points=voltage_points[:10],
        save_dir="simulation_results/insitu"
    )
    
    print("原位分析模拟完成！")
    return insitu_sim

if __name__ == "__main__":
    simulator = main()

